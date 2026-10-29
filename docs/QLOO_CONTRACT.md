# Qloo MCP runtime contract (`qloo mcp`, @qloo/qloo-harness 0.1.26)

Purpose: everything needed to write a schema-exact mock of the canonical Qloo MCP server before a Qloo API key exists.

**Sources.** All `file:line` references point into
`<harness>/node_modules/@qloo/qloo-harness/dist/`. The chunk files are `chunks/chunk-MCLV3P4I.js` (contracts, schemas, query intent, demographic parser), here called **CONTRACT**, and `chunks/chunk-ESNY4EJL.js` (HTTP client and config), here called **CLIENT**.

**How this was verified.** Besides reading the code, I ran the real `qloo mcp` binary against a **loopback fake Qloo HTTP API** (`QLOO_API_KEY=fake-key QLOO_BASE_URL=http://127.0.0.1:18777 QLOO_TRUSTED_BASE_URL=http://127.0.0.1:18777`). No call went to api.qloo.com. Everything the harness builds itself is **observed**: envelope keys, `interpretation`, `resolution`, `query_intent`, `provenance`, the status and error logic, and the exact upstream query strings it sends. Some fields are copied through unchanged from the upstream response: the heatmap, demographics, trend and compare payloads, plus any upstream entity/tag fields. I made those payloads up for the fake API, so their inner shapes are marked **inferred**. They follow my understanding of the public Qloo v2 docs and have not been checked against the live API.

---

## 1. MCP protocol surface (`mcp.js`)

- Transport: stdio, one JSON-RPC 2.0 message per line (`mcp.js:218-222`).
- `initialize` returns `{protocolVersion:"2024-11-05", capabilities:{tools:{},resources:{}}, serverInfo:{name:"qloo-harness", version:"0.1.26"}}` (`mcp.js:230-238`; the version comes from `router.js:5798-5803`).
- `ping` returns `{}`. `notifications/initialized` and `notifications/cancelled` are ignored, so **cancellation is not wired up** and the `CANCELLED` error is unreachable over MCP (`mcp.js:240-245`, `mcp.js:310` passes `signal=undefined`).
- `tools/list` returns 10 tools. Each workflow tool has `outputSchema` = the result envelope schema and `_meta: {"qloo/contractVersion":"1.0.0","qloo/contractChecksum":"sha256:762bdcc5e14ff797b6de739d2658a83f78af35e68d7a5a3449455be6046924f5"}` (`mcp.js:76-125`). The full dump is in `tools.json`.
- `resources/list` returns one resource, `qloo://contracts/workflows` (application/json). `resources/read` on it returns the `qloo_capabilities` payload as compact JSON text (`mcp.js:249-275`). Any other URI gives JSON-RPC error `-32602 "Unknown Qloo MCP resource."`.
- An unknown tool name gives JSON-RPC error `-32602 "Unknown Qloo MCP tool: <name>"`, not a tool result (`mcp.js:298-301`). An unknown method gives `-32601`.
- Every workflow result is wrapped as `{content:[{type:"text", text: JSON.stringify(env, null, 2)}], structuredContent: env}`. `isError: true` is added **only** when `status==="error"`; otherwise the key is absent rather than `false` (`mcp.js:140-146`).
- `execution.correlation_id` is always `"mcp-<jsonrpc id>"` (`mcp.js:303`). It is also sent upstream as the `X-Correlation-Id` header (CLIENT:502).
- Every success or handled-error envelope is post-processed (`mcp.js:147-165`): `execution.transport="mcp"`, `execution.transport_name="Qloo canonical MCP"`, `provenance.transport="mcp"`. It is then re-validated against the envelope schema. A validation failure becomes `MCP_ADAPTER_FAILURE`.

### Key present vs. absent (`mcp.js:303-317`)

| Situation | What the server returns |
|---|---|
| No API key | All 9 workflow tools return the canned `QLOO_AUTH` envelope **without validating input** (`mcp.js:304-307`). `qloo_capabilities` still works and reports `ready:false`. |
| Key present | Request → `makeExecutorTool` (`qloo-tools.js:830-903`) → `createDelegatingQlooWorkflowExecutor` (`workflow-executor.js:212-284`, which validates input) → direct tool (`qloo-tools.js:381-796`). |

---

## 2. Envelope rules

Schema: CONTRACT:235-273. `additionalProperties: true` at the top level. Required keys are only `schema_version`, `operation`, `status` and `execution`. `error` and `provenance` are closed objects (`additionalProperties:false`). `provenance.requests` allows at most 20 items, and each item is `{method:"GET", path, query}`.

Top-level keys that are **not** in your list but are really emitted:

- `resolution`: present on every op except `find_tags`. On ok/empty it holds a report (`qloo-tools.js:270-285`). On needs_input it holds `{issues:[…]}` (`qloo-tools.js:323-330`).
- `explainability`: recommend only, copied from upstream `response.query.explainability` (`qloo-tools.js:443,462`).
- `series`: **trends only, used instead of `results`** (`qloo-tools.js:759-766`).

Which keys appear, by path (observed):

| Path | summary | interpretation | resolution | results | result_count | warnings | query_intent | provenance | error |
|---|---|---|---|---|---|---|---|---|---|
| ok / empty | **absent** | yes | yes, except find_tags | yes (trends: absent, uses `series`) | yes (compare: **absent**) | only if a resolution warning exists | yes | yes | – |
| needs_input | yes | **absent** | `{issues}` | `[]` | **absent** | **absent** (warnings stay inside each issue) | yes | **absent** | – |
| error, handled by executor | `"<transport>: <msg>"` | – | – | `[]` | **absent** | – | yes | – | yes |
| error, no key / adapter failure | fixed text | – | – | `[]` | `0` | – | **absent** | – | yes |

Common pieces:

- `schema_version: "1.0-preview.1"`. `operation` is the operation id without the prefix, e.g. `"recommend"`, not `"qloo_recommend"`.
- `execution: {transport:"mcp", transport_name:"Qloo canonical MCP", correlation_id:"mcp-N", duration_ms:<int>}`. `duration_ms` is 0 for the canned envelopes.
- `provenance` (`qloo-tools.js:331-342`): `{source:"Qloo API", endpoint, documentation:"https://docs.qloo.com/reference/<slug>", requests:[{method:"GET", path:endpoint, query:{…}}], transport:"mcp"}`. `query` is the **pre-serialization** query object: arrays stay arrays and booleans stay booleans. On the wire, arrays are joined with commas (CLIENT:319-327).
- `warnings` (`qloo-tools.js:267-285`): the de-duplicated union of `outcome.warnings` from resolution. It appears both at the top level and in `resolution.warnings`. `find_tags` never has warnings.
- `interpretation` keys with `undefined` values are dropped by `JSON.stringify`. Mock rule: omit them; never send `null`.

### `query_intent` (CONTRACT:595-726)

Always built from the **raw** input (names, not UUIDs; type ids like `"artist"`, not URNs). Base fields: `{schema_version:"1.0-preview.1", source_contract_version:"1.0.0", operation, job:operation, signals:{}, filters:{}, operators:{}, output:{}, assumptions:[], unresolved:[]}`. **`unresolved` is always `[]`**, including on needs_input. Per-op additions:

| op | target | signals | filters | operators | output | assumptions (only when input omitted) |
|---|---|---|---|---|---|---|
| recommend | `{type}` | `entities, tags, location, demographic` | `includeTags, excludeTags, location` (from filter_location) | `signalTags` (default "intersection"), `includeTags`/`excludeTags` (default "union"); each only if that tag array was given | `{limit, explain}` | `"limit=10"`, `"explain=true"` |
| rank | `{type: option_type}` | `entities, location, demographic` | `candidateEntities: options`, `includeTags, excludeTags` | `includeTags:"union"`, `excludeTags:"union"` | `{limit: options.length}` | none |
| describe | `{type?, entities:[entity]}` | `{}` | `{}` | `{}` | `{}` | none |
| where_popular | `{type?, entities:[entity]}` | `{}` | `{location: within}` | `{}` | `{limit}` | `"limit=10"` |
| compare_audiences | `{type}` only if target_type given | `{groups:[group_a, group_b]}` | `{}` | `{}` | `{limit}` | `"limit=10"` |
| entity_tags | `{type}` only if entity_type given | `{entities}` | `{}` | `{}` | `{limit}` | `"limit=10"` |
| audience_demographics | `{type?, entities:[entity]}` | `{}` | `{}` | `{}` | `{limit}` | `"limit=10"` |
| trends | `{type, entities}` | `{}` | `{startDate, endDate}` | `{}` | `{limit}` | `"limit=10"` |
| find_tags | `{concept: query}` | `{}` | `{}` | `{}` | `{limit}` | `"semantic=true"`, `"limit=10"` |

Key order in the real output: the base keys come first and `target` is appended **last**. This does not matter for JSON consumers.

### `resolution` report (ok/empty) and its sub-shapes

Report shape (`qloo-tools.js:270-278`):

```json
{
  "contract_version": "1.0-preview.1",
  "provider": {
    "contract_version": "1.0-preview.1",
    "provider_id": "qloo_api",
    "name": "Qloo native resolution",
    "entity_strategy": "exact_name_context_or_choice",
    "tag_strategy": "target_scoped_semantic_search_exact_name_or_choice",
    "remote": true,
    "uses_model": false,
    "fallback": "none"
  },
  "outcomes": [ /* one per resolved input, in field order */ ],
  "warnings": [ /* optional */ ]
}
```

- The provider descriptor is at `resolution-provider.js:249-258`. Below it is written as `<PROVIDER>`.
- Outcome schema: CONTRACT:834-861. A resolved outcome is `{input, status:"resolved", match:"identifier"|"exact"|"semantic", selected:CANDIDATE, provenance:RES_PROV, alternatives?:[CANDIDATE] (≤4), warnings?:[string]}`.

CANDIDATE (closed object, CONTRACT:808-822; built at `resolution-provider.js:170-214`):

```
{ id, name, type?, rank? (tags only, 1-based), score?, popularity?, parent_types? (tags), description? (≤500 chars), release_year?, address? }
```

RES_PROV (`resolution-provider.js:215-227`):

```
{ contract_version:"1.0-preview.1", provider_id:"qloo_api", provider_name:"Qloo native resolution",
  endpoint, strategy, remote:true, uses_model:false, cache_status? }
```

`endpoint` and `strategy` values:

| Input kind | endpoint | strategy |
|---|---|---|
| Entity name | `"/search"` | `"exact_name_context_or_choice"` |
| Entity UUID | `"/entities"` | `"identifier_lookup"` |
| Tag concept, with target scope | `"/v2/tags"` | `"semantic_search_local_parent_scope_exact_name_or_choice"` |
| Tag concept, no target scope | `"/v2/tags"` | `"semantic_search_exact_name_or_choice"` |
| Tag URN | `"local:tag-urn"` | `"supplied_identifier"` |

`cache_status: "memory_hit"` is added when an outcome comes from the in-process cache (15 min TTL, 256 entries; `resolution-provider.js:17-18,269-290`; observed on the second identical call).

Interpreted entity, used in `interpretation` (`qloo-tools.js:174-183`): `{input, entityId, name, type?, match, score?}`. Note the **camelCase `entityId`**.

Interpreted tag (`qloo-tools.js:220-228`): `{input, tagId, name, match, score?}`. There is no `type` field.

---

## 3. How inputs are interpreted

### Entity fields

The entity fields are `signals`, `options`, `entity`, `entities`, `group_a` and `group_b`. A name is resolved automatically; a UUID is looked up. Code: `resolution-provider.js:308-348`.

**UUID inputs.** The value must match `/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` (`resolution-provider.js:9`). That means an RFC-4122 version nibble 1-5 and variant 8/9/a/b. The server calls `GET /entities?entity_ids=<uuid>`:

- exactly 1 id match → `match:"identifier"`
- 0 matches → `not_found`

A UUID-looking string that fails the regex is treated as a **name search**.

**Name inputs.** The server calls `GET /search?query=<input>&types=<urn>&take=5`. The `types` parameter is sent only if the op has a type scope; see the table below.

1. 0 candidates → `not_found`.
2. Exactly one candidate whose NFKC-lowercased name equals the input → `match:"exact"`. The other candidates (≤4) become `alternatives`.
3. Otherwise a **context match** runs (`resolution-provider.js:113-144`). It needs ≥2 candidates and ≥2 input tokens (tokens: length ≥2, minus stop words). If exactly one candidate contains **all** input tokens in its name + type + description + address, it wins as `match:"semantic"` with the warning `"Qloo selected the only candidate matching every supplied name and location term; reuse its Qloo ID to override future name resolution."`
4. Otherwise → `ambiguous` with ≤5 candidates. **A single non-exact hit is still `ambiguous`**: probe input `"film Heat"` with one result `"Heat"` gave needs_input with 1 candidate. If several candidates share the max token count, the narrowing warning `"Qloo candidate choices were narrowed using the supplied name and location terms."` is attached.

Type scope sent as `types=` during entity resolution (`qloo-tools.js`):

| Op | Field | Scope |
|---|---|---|
| recommend | signals | none |
| rank | options | `option_type` URN |
| rank | signals | none |
| describe | entity | `type` |
| where_popular, entity_tags, audience_demographics | entity / entities | `entity_type` |
| trends | entities | `entity_type` (required) |
| compare_audiences | group_a, group_b | none |

### Tag fields

The tag fields are `signal_tags`, `include_tags` and `exclude_tags`, used by recommend and rank (`resolution-provider.js:349-397`).

**URN inputs.** An input starting with `urn:tag:` is accepted as-is with **no lookup**: `selected = {id: urn, name: urn}`, so `interpretation.*.name` equals the URN.

**Concept inputs.** The server calls `GET /v2/tags?filter.query=<input>&feature.semantic_search=true&take=20`.

1. If any candidate has `parents[].type` metadata, the candidates are filtered to those whose parent types include the target URN. If none survive → `not_found` with the warning `"No candidate in the first N Qloo semantic tag results supports urn:entity:<type>."`
2. A unique exact (normalized) name match → `match:"exact"`.
3. **Anything else → `ambiguous`.** It carries ≤5 candidates and the warning `"Qloo semantic search returned ranked candidates without a calibrated relevance score; choose one before the workflow continues."`

Native mode **never auto-picks a semantic tag**. In practice, free-text concepts such as "quiet luxury" will usually return `needs_input` unless a tag has exactly that name. The expected flow is `qloo_find_tags` first, then pass the URNs.

### Re-submitting a choice

Call the **same tool again with the same arguments**, replacing the ambiguous input string with the chosen candidate's `id`: a UUID for entities, a `urn:tag:…` for tags. Use the same field, at the same array position. This is exactly what the harness's own UI does (`qloo-presentation.js:367-402`, `applyResolutionChoices`). There is no session or choice token; each call is independent. The second call then reports `match:"identifier"` for that input.

### Types (CONTRACT:71-123, 197-204)

The schema enums accept only the bare ids:

- insights types: `artist, book, brand, movie, person, place, podcast, tv_show, videogame`
- search types: the insights types plus `locality, actor, album, author, director`

Ids are mapped to `urn:entity:<id>`. `interpretation.target_type` / `option_type` / `entity_type` hold the **URN**, while `query_intent.target.type` holds the raw id. Aliases like `"tv shows"` exist in code, but the schema enum rejects them before they are used.

### Locations

`signal_location`, `filter_location` and `within` are free strings (minLength 1) passed **verbatim** as `signal.location.query` / `filter.location.query` (`qloo-tools.js:423-430,507-508,601`). The harness does no parsing, geocoding, WKT, or lat/long handling, and never uses the bare `signal.location` / `filter.location` params. **Inferred:** Qloo's `.query` params take a place name such as "Brooklyn" or "New York City". Whether WKT or coordinates work there depends on Qloo, not the harness.

### `demographic` (CONTRACT:749-793)

Matching happens on NFKC-lowercased text.

**Gender:**

| Pattern | Result |
|---|---|
| `\b(women\|woman\|female\|ladies)\b` | `female` |
| else `\b(men\|man\|male\|guys)\b` | `male` |

**Age:** the first rule that matches wins. The result is a comma-joined list drawn from `24_and_younger, 25_to_29, 30_to_34, 35_to_44, 45_to_54, 55_and_older`.

| Pattern | Result |
|---|---|
| explicit range `N-M` / `N–M` / `N to M` | every bucket overlapping the range (`"men 25-34"` → `25_to_29,30_to_34`) |
| teen / teens / teenager(s) / gen z | `24_and_younger` |
| young | `24_and_younger,25_to_29` |
| millennial(s) | `30_to_34,35_to_44` |
| senior(s) / elderly / retiree(s) | `55_and_older` |
| middle aged | `35_to_44,45_to_54` |
| over / older than / above N | N..120 |
| under / younger than / below N | 0..N |

**Mapping to the request:** gender → `signal.demographics.gender`, age → `signal.demographics.age`. `interpretation.demographic` is `{input, gender?, age?}`.

**Preconditions** (recommend `qloo-tools.js:394-403`, rank 481-490). Each failure returns needs_input:

1. If nothing maps, the summary is `Could not map demographic "<x>" to Qloo age or gender signals. Use a phrase such as "young women" or "men 25-34".` For rank, the summary stops after `signals.`
2. If there is a demographic but no `signal_location`, the summary is `Demographic Qloo signals require signal_location so the audience geography is explicit.`
3. If there is no entity, tag, location, or demographic, the summaries are:
   - recommend: `Provide at least one entity, tag, location, or demographic taste signal.`
   - rank: `Ranking requires an entity, location, or demographic signal.` Rank has no `signal_tags`.

### Limits and hidden caps

**From the schema (enforced by `TOOL_INPUT`, CONTRACT:209-224, 274-346):**
- `limit` is an integer 1-20, default 10.
- Entity and tag arrays hold 1-10 items, each a string of minLength 1.
- `trends.entities` holds 1-5 items.
- Dates must match `^\d{4}-\d{2}-\d{2}$`.
- `additionalProperties:false` everywhere.
- `rank` has **no `limit`**: `take = number of options` (`qloo-tools.js:503,522`).

**Runtime caps:**

| Cap | Value | Where |
|---|---|---|
| Entity search | `take=5` | `resolution-provider.js:324` |
| Tag search | `take=20` | `resolution-provider.js:357` |
| Candidates per issue | 5 | |
| Alternatives | 4 | |
| `boundedValue`, applied to copied-through upstream data | strings over 2000 chars are cut and end in `…`; arrays keep their first 20 items; objects keep their first 40 keys; nesting depth ≥5 becomes the string `"[detail omitted]"` | `qloo-tools.js:100-113` |
| HTTP client | 20 s timeout per attempt, 3 attempts, exponential backoff of about 250/500 ms with jitter, Retry-After honored up to 30 s, 5 MB response cap | CLIENT:290-294, 479-564 |

**Trends:** `limit` also truncates **each entity's time series** to `limit` points (`qloo-tools.js:751,756`). A 30-day range returns at most 10 points unless `limit` is raised, and never more than 20.

Trends dates are also checked as real calendar dates, with start ≤ end. This check throws a plain `Error` (`qloo-tools.js:737-739`), which surfaces as **`MCP_ADAPTER_FAILURE`, not `TOOL_INPUT`** (observed with `2026-02-30`).

---

## 4. Per-operation contract

Two item shapes are reused below.

**ENTITY item** (compactEntity, `qloo-tools.js:114-144`), with keys in this order and any undefined key dropped:

```
{ entity_id, name, type?, subtype?, popularity?, affinity?, explainability?, properties? }
```

- `entity_id` = upstream `entity_id` ?? `id`.
- `affinity` = upstream `affinity` ?? `query.affinity`.
- `explainability` = upstream `query.explainability`, passed through `boundedValue`.
- `properties` is a whitelist subset: `description, short_description, release_year, release_date, content_rating, duration, image, geocode, address, price_level, business_rating`. It is omitted if empty.
- Upstream `tags`, `types`, `akas`, `location` and the like are **dropped**.
- **Inferred:** real Qloo insights entities carry `type:"urn:entity"` and `subtype:"urn:entity:<x>"`.

**TAG item** (compactTag, `qloo-tools.js:145-157`): `{ id, name, type?, popularity?, affinity? }`.

- `id` = upstream `id` ?? `tag_id`.
- `type` = upstream `type` ?? `subtype`.
- `affinity` = `affinity` ?? `query.affinity`.

In every example below, the envelope structure, key names and harness-generated strings are observed from the real binary. IDs and numeric values are illustrative: they come from the fake upstream, and a few were edited to be distinct. `<PROVIDER>` is the descriptor from §2. `RES_PROV(/search)` is written out in full once and then abbreviated.

### 4.1 recommend (`qloo-tools.js:381-467`)

**Upstream request:** `GET /v2/insights` with these params:
- `filter.type=<urn>` and `take=limit`
- `signal.interests.entities`, plus `signal.interests.tags` with `operator.signal.interests.tags` (default `intersection`)
- `signal.location.query`, `signal.demographics.gender`, `signal.demographics.age`
- `filter.location.query`
- `filter.tags` with `operator.filter.tags` (default `union`), and `filter.exclude.tags` with `operator.filter.exclude.tags` (default `union`)
- `feature.explainability=true`, unless `explain:false`

**`results`:** ENTITY[] from upstream `results.entities` (or `results` if it is an array), sliced to `limit`.

**`interpretation`:**

```
{ target_type:<urn>, signals:[IE], signal_tags:[IT], signal_tags_operator?, signal_location?,
  demographic?, filter_location?, include_tags:[IT], include_tags_operator?, exclude_tags:[IT], exclude_tags_operator? }
```

The three tag arrays are **always present**, possibly empty. Each operator key is present only when its tag array is non-empty.

**Status:** `ok`, **even with 0 results**. recommend never returns `empty`.

Example, observed (pass-through entity values are from the fake upstream):

```json
{
  "schema_version": "1.0-preview.1",
  "operation": "recommend",
  "status": "ok",
  "interpretation": {
    "target_type": "urn:entity:artist",
    "signals": [{"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"}],
    "signal_tags": [{"input": "jazz", "tagId": "urn:tag:genre:music:jazz", "name": "Jazz", "match": "exact"}],
    "signal_tags_operator": "intersection",
    "signal_location": "New York",
    "demographic": {"input": "young women", "gender": "female", "age": "24_and_younger,25_to_29"},
    "filter_location": "Brooklyn",
    "include_tags": [],
    "exclude_tags": []
  },
  "resolution": {
    "contract_version": "1.0-preview.1",
    "provider": "<PROVIDER>",
    "outcomes": [
      {
        "input": "Radiohead", "status": "resolved", "match": "exact",
        "selected": {"id": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "popularity": 0.987, "description": "English rock band", "release_year": 1985},
        "provenance": {"contract_version": "1.0-preview.1", "provider_id": "qloo_api", "provider_name": "Qloo native resolution", "endpoint": "/search", "strategy": "exact_name_context_or_choice", "remote": true, "uses_model": false},
        "alternatives": [{"id": "1b2c3d4e-1111-4aaa-8bbb-000000000003", "name": "Taylor Hawkins", "type": "urn:entity:artist", "popularity": 0.71}]
      },
      {
        "input": "jazz", "status": "resolved", "match": "exact",
        "selected": {"id": "urn:tag:genre:music:jazz", "name": "Jazz", "type": "urn:tag:genre:music", "rank": 1, "popularity": 0.88, "parent_types": ["urn:entity:artist"]},
        "provenance": {"contract_version": "1.0-preview.1", "provider_id": "qloo_api", "provider_name": "Qloo native resolution", "endpoint": "/v2/tags", "strategy": "semantic_search_local_parent_scope_exact_name_or_choice", "remote": true, "uses_model": false},
        "alternatives": [{"id": "urn:tag:genre:music:smooth_jazz", "name": "Smooth Jazz", "type": "urn:tag:genre:music", "rank": 2, "popularity": 0.61, "parent_types": ["urn:entity:artist"]}]
      }
    ]
  },
  "results": [
    {
      "entity_id": "3f1e2d3c-2222-4bbb-8ccc-000000000010", "name": "Portishead", "type": "urn:entity", "subtype": "urn:entity:artist",
      "popularity": 0.93, "affinity": 0.981,
      "explainability": {"signal.interests.entities": [{"entity_id": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "score": 0.73}]},
      "properties": {"short_description": "Trip hop group", "image": {"url": "https://images.qloo.com/i/ph.jpg"}}
    },
    {"entity_id": "3f1e2d3c-2222-4bbb-8ccc-000000000011", "name": "Massive Attack", "subtype": "urn:entity:artist", "popularity": 0.95, "affinity": 0.962}
  ],
  "result_count": 2,
  "explainability": {"signal.interests.entities": [{"entity_id": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "average_score": 0.71}]},
  "provenance": {
    "source": "Qloo API", "endpoint": "/v2/insights", "documentation": "https://docs.qloo.com/reference/insights-api-deep-dive",
    "requests": [{"method": "GET", "path": "/v2/insights", "query": {
      "filter.type": "urn:entity:artist", "take": 5,
      "signal.interests.entities": ["9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01"],
      "signal.interests.tags": ["urn:tag:genre:music:jazz"], "operator.signal.interests.tags": "intersection",
      "signal.location.query": "New York", "signal.demographics.gender": "female", "signal.demographics.age": "24_and_younger,25_to_29",
      "filter.location.query": "Brooklyn", "feature.explainability": true}}],
    "transport": "mcp"
  },
  "query_intent": {
    "schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "recommend", "job": "recommend",
    "signals": {"entities": ["Radiohead"], "tags": ["jazz"], "location": "New York", "demographic": "young women"},
    "filters": {"location": "Brooklyn"}, "operators": {"signalTags": "intersection"},
    "output": {"limit": 5, "explain": true}, "assumptions": ["explain=true"], "unresolved": [],
    "target": {"type": "artist"}
  },
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-3", "duration_ms": 23}
}
```

The semantic-match variant adds top-level `"warnings": ["Qloo selected the only candidate matching every supplied name and location term; reuse its Qloo ID to override future name resolution."]`. The same string appears in `resolution.warnings` and in the outcome's `warnings`.

### 4.2 rank (`qloo-tools.js:468-541`)

**Upstream request:** `GET /v2/insights` with these params:
- `filter.type`
- `filter.results.entities=<option ids>` and `take=<#options>`
- `signal.interests.entities`, `signal.location.query`, `signal.demographics.*`
- `filter.tags` / `filter.exclude.tags`, both with operator `union`

**`results`:** ENTITY[] in upstream order (that order *is* the ranking), sliced to the number of options.

**`interpretation`:** `{option_type:<urn>, options:[IE], signals:[IE], signal_location?, demographic?, include_tags:[IT], exclude_tags:[IT]}`. There are no operator keys.

**Status:** always `ok`.

```json
{
  "schema_version": "1.0-preview.1", "operation": "rank", "status": "ok",
  "interpretation": {
    "option_type": "urn:entity:movie",
    "options": [
      {"input": "Heat", "entityId": "7c1a0000-0000-4000-8000-000000000001", "name": "Heat", "type": "urn:entity:movie", "match": "exact"},
      {"input": "Drive", "entityId": "7c1a0000-0000-4000-8000-000000000002", "name": "Drive", "type": "urn:entity:movie", "match": "exact"}
    ],
    "signals": [{"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"}],
    "signal_location": "London",
    "demographic": {"input": "millennials", "age": "30_to_34,35_to_44"},
    "include_tags": [], "exclude_tags": []
  },
  "resolution": {"contract_version": "1.0-preview.1", "provider": "<PROVIDER>", "outcomes": ["<one resolved outcome per option, then per signal>"]},
  "results": [
    {"entity_id": "7c1a0000-0000-4000-8000-000000000002", "name": "Drive", "type": "urn:entity", "subtype": "urn:entity:movie", "popularity": 0.91, "affinity": 0.88},
    {"entity_id": "7c1a0000-0000-4000-8000-000000000001", "name": "Heat", "type": "urn:entity", "subtype": "urn:entity:movie", "popularity": 0.95, "affinity": 0.74}
  ],
  "result_count": 2,
  "provenance": {"source": "Qloo API", "endpoint": "/v2/insights", "documentation": "https://docs.qloo.com/reference/insights-api-deep-dive",
    "requests": [{"method": "GET", "path": "/v2/insights", "query": {"filter.type": "urn:entity:movie",
      "filter.results.entities": ["7c1a0000-0000-4000-8000-000000000001", "7c1a0000-0000-4000-8000-000000000002"], "take": 2,
      "signal.interests.entities": ["9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01"], "signal.location.query": "London",
      "signal.demographics.age": "30_to_34,35_to_44"}}], "transport": "mcp"},
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "rank", "job": "rank",
    "signals": {"entities": ["Radiohead"], "location": "London", "demographic": "millennials"},
    "filters": {"candidateEntities": ["Heat", "Drive"]}, "operators": {}, "output": {"limit": 2}, "assumptions": [], "unresolved": [],
    "target": {"type": "movie"}},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-2", "duration_ms": 23}
}
```

The `"<…>"` strings in that example are placeholders for this doc, not real values.

### 4.3 describe (`qloo-tools.js:542-578`)

**Resolution:** the server resolves the entity, scoped by `type` if given.

**`results`:**
- **Name input** (match exact or semantic): hydrated through `GET /entities?entity_ids=<id>`. `results` is ENTITY[] (upstream `results.entities` or an array).
- **UUID input** (match identifier): **no hydration**. `results` is the minimal `[{entity_id, name, type}]`, where `type` is the resolved candidate type, e.g. `urn:entity:artist`.
- If hydration returns nothing, it falls back to the minimal form.

**`interpretation`:** `{entity: IE}`.

**Status:** `ok`. `empty` is coded (`:565`) but effectively unreachable, because an unresolved entity becomes needs_input instead (inferred).

**`provenance`:** endpoint `/entities`, documentation `get-entities`, `requests[0].query = {entity_ids:[id]}`. This is the same even when no hydration call was made.

```json
{
  "schema_version": "1.0-preview.1", "operation": "describe", "status": "ok",
  "interpretation": {"entity": {"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"}},
  "resolution": {"contract_version": "1.0-preview.1", "provider": "<PROVIDER>", "outcomes": ["<resolved outcome, endpoint /search>"]},
  "results": [{"entity_id": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "subtype": "urn:entity:artist", "popularity": 0.987,
    "properties": {"short_description": "English rock band", "release_year": 1985, "image": {"url": "https://images.qloo.com/i/rh.jpg"}}}],
  "result_count": 1,
  "provenance": {"source": "Qloo API", "endpoint": "/entities", "documentation": "https://docs.qloo.com/reference/get-entities",
    "requests": [{"method": "GET", "path": "/entities", "query": {"entity_ids": ["9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01"]}}], "transport": "mcp"},
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "describe", "job": "describe",
    "signals": {}, "filters": {}, "operators": {}, "output": {}, "assumptions": [], "unresolved": [],
    "target": {"type": "artist", "entities": ["Radiohead"]}},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-6", "duration_ms": 2}
}
```

UUID input gives `"results": [{"entity_id": "9a5b…7d01", "name": "Radiohead", "type": "urn:entity:artist"}]` and an interpretation with `"match": "identifier"`.

### 4.4 where_popular (`qloo-tools.js:579-616`)

**Upstream request:** `GET /v2/insights` with `filter.type=urn:heatmap`, `signal.interests.entities=<one id>` (a **string**, not an array), `filter.location.query=<within>` and `take=limit`.

**`results`:** raw upstream `results.heatmap` points passed through `boundedValue`. They are **re-sorted by `point.query.affinity` descending** (points without it go last) and sliced to `limit`. **Inferred** point shape: `{location:{latitude, longitude, geohash}, query:{affinity, affinity_rank, popularity}}`.

**`interpretation`:** `{entity: IE, within}`.

**Status:** `ok`, or **`empty` if 0 points**.

```json
{
  "schema_version": "1.0-preview.1", "operation": "where_popular", "status": "ok",
  "interpretation": {"entity": {"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"}, "within": "New York City"},
  "resolution": {"contract_version": "1.0-preview.1", "provider": "<PROVIDER>", "outcomes": ["<resolved outcome>"]},
  "results": [
    {"location": {"latitude": 40.678, "longitude": -73.944, "geohash": "dr5rsj"}, "query": {"affinity": 0.92, "affinity_rank": 0.99, "popularity": 0.64}},
    {"location": {"latitude": 40.7128, "longitude": -74.006, "geohash": "dr5reg"}, "query": {"affinity": 0.71, "affinity_rank": 0.93, "popularity": 0.88}}
  ],
  "result_count": 2,
  "provenance": {"source": "Qloo API", "endpoint": "/v2/insights", "documentation": "https://docs.qloo.com/reference/heatmaps-use-case",
    "requests": [{"method": "GET", "path": "/v2/insights", "query": {"filter.type": "urn:heatmap", "signal.interests.entities": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "filter.location.query": "New York City", "take": 5}}], "transport": "mcp"},
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "where_popular", "job": "where_popular",
    "signals": {}, "filters": {"location": "New York City"}, "operators": {}, "output": {"limit": 5}, "assumptions": [], "unresolved": [],
    "target": {"entities": ["Radiohead"]}},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-8", "duration_ms": 1}
}
```

### 4.5 compare_audiences (`qloo-tools.js:617-656`)

**Upstream request:** `GET /v2/analysis/compare` with `a.signal.interests.entities`, `b.signal.interests.entities`, `take=limit`, and `filter.type` only if `target_type` was given.

**`results`:** `boundedValue(response.results)`, i.e. the **raw upstream `results` value whatever its type**. It may be an object, not an array. There is **no `result_count`**, and **no slicing to `limit`** beyond boundedValue's 20-item cap. The harness itself defines no shared/distinct structure. **Inferred** upstream shape: `{tags:[{tag_id, name, subtype, query:{…a/b affinity…}}]}`. Treat it as opaque.

**`interpretation`:** `{group_a:[IE], group_b:[IE], target_type?:<urn>}`.

**Status:** always `ok`.

```json
{
  "schema_version": "1.0-preview.1", "operation": "compare_audiences", "status": "ok",
  "interpretation": {
    "group_a": [{"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"}],
    "group_b": [{"input": "Taylor Swift", "entityId": "1b2c3d4e-1111-4aaa-8bbb-000000000001", "name": "Taylor Swift", "type": "urn:entity:artist", "match": "exact"}],
    "target_type": "urn:entity:artist"
  },
  "resolution": {"contract_version": "1.0-preview.1", "provider": "<PROVIDER>", "outcomes": ["<group_a outcomes>", "<group_b outcomes>"]},
  "results": {"tags": [{"tag_id": "urn:tag:genre:music:art_rock", "name": "Art Rock", "subtype": "urn:tag:genre:music", "query": {"a": {"affinity": 0.9}, "b": {"affinity": 0.2}, "delta": 0.7}}]},
  "provenance": {"source": "Qloo API", "endpoint": "/v2/analysis/compare", "documentation": "https://docs.qloo.com/reference/analysis-compare",
    "requests": [{"method": "GET", "path": "/v2/analysis/compare", "query": {"a.signal.interests.entities": ["9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01"], "b.signal.interests.entities": ["1b2c3d4e-1111-4aaa-8bbb-000000000001"], "take": 5, "filter.type": "urn:entity:artist"}}], "transport": "mcp"},
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "compare_audiences", "job": "compare_audiences",
    "signals": {"groups": [["Radiohead"], ["Taylor Swift"]]}, "filters": {}, "operators": {}, "output": {"limit": 5}, "assumptions": [], "unresolved": [],
    "target": {"type": "artist"}},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-3", "duration_ms": 3}
}
```

### 4.6 entity_tags (`qloo-tools.js:657-689`)

**Upstream request:** `GET /v2/insights` with `filter.type=urn:tag`, `signal.interests.entities=[ids]` and `take=limit`.

**`results`:** TAG[] from upstream `results.tags`, sliced to `limit`.

**`interpretation`:** `{entities:[IE]}`.

**Status:** always `ok`.

```json
{
  "schema_version": "1.0-preview.1", "operation": "entity_tags", "status": "ok",
  "interpretation": {"entities": [{"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"}]},
  "resolution": {"contract_version": "1.0-preview.1", "provider": "<PROVIDER>", "outcomes": ["<resolved outcome>"]},
  "results": [
    {"id": "urn:tag:genre:music:art_rock", "name": "Art Rock", "type": "urn:tag:genre:music", "popularity": 0.77, "affinity": 0.95},
    {"id": "urn:tag:keyword:music:melancholic", "name": "Melancholic", "type": "urn:tag:keyword:music", "popularity": 0.55, "affinity": 0.83}
  ],
  "result_count": 2,
  "provenance": {"source": "Qloo API", "endpoint": "/v2/insights", "documentation": "https://docs.qloo.com/reference/taste-analysis",
    "requests": [{"method": "GET", "path": "/v2/insights", "query": {"filter.type": "urn:tag", "signal.interests.entities": ["9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01"], "take": 5}}], "transport": "mcp"},
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "entity_tags", "job": "entity_tags",
    "signals": {"entities": ["Radiohead"]}, "filters": {}, "operators": {}, "output": {"limit": 5}, "assumptions": [], "unresolved": []},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-9", "duration_ms": 1}
}
```

### 4.7 audience_demographics (`qloo-tools.js:690-725`)

**Upstream request:** `GET /v2/insights` with `filter.type=urn:demographics`, `signal.interests.entities=<one id>` (a string) and `take=limit`.

**`results`:** raw upstream `results.demographics` items passed through `boundedValue`, sliced to `limit`. **Inferred** item shape: `{entity_id, query:{age:{"24_and_younger":n, "25_to_29":n, "30_to_34":n, "35_to_44":n, "45_to_54":n, "55_and_older":n}, gender:{male:n, female:n}}}`. The values are relative affinity in -1..1. The bucket names do match the harness's own age buckets (CONTRACT:750-757).

**`interpretation`:** `{entity: IE}`.

**Status:** always `ok`.

```json
{
  "schema_version": "1.0-preview.1", "operation": "audience_demographics", "status": "ok",
  "interpretation": {"entity": {"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"}},
  "resolution": {"contract_version": "1.0-preview.1", "provider": "<PROVIDER>", "outcomes": ["<resolved outcome>"]},
  "results": [{"entity_id": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "query": {
    "age": {"24_and_younger": 0.12, "25_to_29": 0.31, "30_to_34": 0.22, "35_to_44": 0.05, "45_to_54": -0.18, "55_and_older": -0.41},
    "gender": {"male": 0.14, "female": -0.14}}}],
  "result_count": 1,
  "provenance": {"source": "Qloo API", "endpoint": "/v2/insights", "documentation": "https://docs.qloo.com/reference/demographics-use-case",
    "requests": [{"method": "GET", "path": "/v2/insights", "query": {"filter.type": "urn:demographics", "signal.interests.entities": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "take": 10}}], "transport": "mcp"},
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "audience_demographics", "job": "audience_demographics",
    "signals": {}, "filters": {}, "operators": {}, "output": {"limit": 10}, "assumptions": ["limit=10"], "unresolved": [],
    "target": {"entities": ["Radiohead"]}},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-10", "duration_ms": 1}
}
```

### 4.8 trends (`qloo-tools.js:726-769`)

**Upstream requests:** **one `GET /v2/trending` per entity**, run in parallel, each with `filter.type`, `filter.start_date`, `filter.end_date`, `signal.interests.entities=<one id>` (a string) and `take=limit`.

**No `results` key.** The data is in `series: [{entity: IE, points: [...]}]`, with one series per entity. `result_count` = the number of series.

**`points`:** raw upstream `results.trending` items passed through `boundedValue`, sliced to `limit`. **Inferred** point shape: `{date:"YYYY-MM-DD", population_percentile, population_rank, population_rank_velocity, population_percentile_velocity}`.

**`interpretation`:** `{entity_type:<urn>, start_date, end_date}`. The entities appear only in `series[].entity`.

**Status:** always `ok`.

```json
{
  "schema_version": "1.0-preview.1", "operation": "trends", "status": "ok",
  "interpretation": {"entity_type": "urn:entity:artist", "start_date": "2026-09-01", "end_date": "2026-09-30"},
  "resolution": {"contract_version": "1.0-preview.1", "provider": "<PROVIDER>", "outcomes": ["<resolved outcome>"]},
  "series": [{
    "entity": {"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"},
    "points": [
      {"date": "2026-09-01", "population_percentile": 0.97, "population_rank": 112, "population_rank_velocity": -3, "population_percentile_velocity": 0.001},
      {"date": "2026-09-08", "population_percentile": 0.975, "population_rank": 104, "population_rank_velocity": -8, "population_percentile_velocity": 0.005}
    ]
  }],
  "result_count": 1,
  "provenance": {"source": "Qloo API", "endpoint": "/v2/trending", "documentation": "https://docs.qloo.com/reference/get-trending",
    "requests": [{"method": "GET", "path": "/v2/trending", "query": {"filter.type": "urn:entity:artist", "filter.start_date": "2026-09-01", "filter.end_date": "2026-09-30", "signal.interests.entities": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "take": 10}}], "transport": "mcp"},
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "trends", "job": "trends",
    "signals": {}, "filters": {"startDate": "2026-09-01", "endDate": "2026-09-30"}, "operators": {}, "output": {"limit": 10}, "assumptions": ["limit=10"], "unresolved": [],
    "target": {"type": "artist", "entities": ["Radiohead"]}},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-11", "duration_ms": 2}
}
```

### 4.9 find_tags (`qloo-tools.js:770-796`)

**Upstream request:** `GET /v2/tags` with `filter.query`, `feature.semantic_search=<semantic ?? true>` and `take=limit`.

There is no resolution step and therefore no `resolution` key. find_tags never returns needs_input.

**`results`:** TAG[] from upstream `results.tags`. `parents` is dropped, and `affinity` is usually absent.

**`interpretation`:** `{query, semantic}`.

**Status:** always `ok`.

**Note:** `provenance.documentation` here is `…/reference/get-tags`, while the capabilities `documentation` says `get-tags-1`.

```json
{
  "schema_version": "1.0-preview.1", "operation": "find_tags", "status": "ok",
  "interpretation": {"query": "jazz", "semantic": true},
  "results": [
    {"id": "urn:tag:genre:music:jazz", "name": "Jazz", "type": "urn:tag:genre:music", "popularity": 0.88},
    {"id": "urn:tag:genre:music:smooth_jazz", "name": "Smooth Jazz", "type": "urn:tag:genre:music", "popularity": 0.61},
    {"id": "urn:tag:keyword:media:jazz_age", "name": "Jazz Age", "type": "urn:tag:keyword:media", "popularity": 0.4}
  ],
  "result_count": 3,
  "provenance": {"source": "Qloo API", "endpoint": "/v2/tags", "documentation": "https://docs.qloo.com/reference/get-tags",
    "requests": [{"method": "GET", "path": "/v2/tags", "query": {"filter.query": "jazz", "feature.semantic_search": true, "take": 3}}], "transport": "mcp"},
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "find_tags", "job": "find_tags",
    "signals": {}, "filters": {}, "operators": {}, "output": {"limit": 3}, "assumptions": ["semantic=true"], "unresolved": [],
    "target": {"concept": "jazz"}},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-12", "duration_ms": 1}
}
```

---

## 5. Non-ok statuses

### `needs_input` (`qloo-tools.js:323-330`)

Produced in two cases:

1. **Any resolution issue**, meaning an entity or tag that is `ambiguous` or `not_found`. All of an op's resolutions run in parallel, and **every** issue is reported together. Resolved inputs are not listed. Summaries by op:

   | Op | Summary |
   |---|---|
   | recommend | `"Choose or correct the unresolved Qloo inputs."` |
   | rank | `"Choose or correct the unresolved ranking inputs."` |
   | compare_audiences | `"Choose or correct the unresolved comparison inputs."` |
   | entity_tags, trends | `"Choose or correct the unresolved Qloo entities."` |
   | describe, where_popular, audience_demographics | `"Choose the intended Qloo entity."` |

2. **Preconditions** (see §3, demographic). In this case `resolution.issues` is `[]`.

Issue shape (`qloo-tools.js:205-216, 251-263`):

```
{ input, kind:"ambiguous"|"not_found", input_kind:"entity"|"tag", field:<input field name>,
  scope?:<urn>, purpose?:"signal"|"include_filter"|"exclude_filter" (tags only),
  candidates?:[CANDIDATE] (≤5; usually absent for not_found), provenance:RES_PROV, warnings?:[string] }
```

`scope` is the entity type URN when the field is scoped. Tags always carry `scope` and `purpose`. The candidate list lives **only** in `resolution.issues[].candidates`; `results` is always `[]`.

Ambiguous entity (observed):

```json
{
  "schema_version": "1.0-preview.1", "operation": "recommend", "status": "needs_input",
  "summary": "Choose or correct the unresolved Qloo inputs.",
  "resolution": {"issues": [{
    "input": "Taylor", "kind": "ambiguous", "input_kind": "entity", "field": "signals",
    "candidates": [
      {"id": "1b2c3d4e-1111-4aaa-8bbb-000000000001", "name": "Taylor Swift", "type": "urn:entity:artist", "popularity": 0.999, "description": "American singer-songwriter"},
      {"id": "1b2c3d4e-1111-4aaa-8bbb-000000000002", "name": "Taylor Swift (Album)", "type": "urn:entity:album", "popularity": 0.81, "release_year": 2006},
      {"id": "1b2c3d4e-1111-4aaa-8bbb-000000000003", "name": "Taylor Hawkins", "type": "urn:entity:artist", "popularity": 0.71}
    ],
    "provenance": {"contract_version": "1.0-preview.1", "provider_id": "qloo_api", "provider_name": "Qloo native resolution", "endpoint": "/search", "strategy": "exact_name_context_or_choice", "remote": true, "uses_model": false}
  }]},
  "results": [],
  "query_intent": {"schema_version": "1.0-preview.1", "source_contract_version": "1.0.0", "operation": "recommend", "job": "recommend",
    "signals": {"entities": ["Taylor", "Radiohead"]}, "filters": {}, "operators": {}, "output": {"limit": 10, "explain": true},
    "assumptions": ["limit=10", "explain=true"], "unresolved": [], "target": {"type": "artist"}},
  "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-6", "duration_ms": 2}
}
```

To re-submit, send `signals: ["1b2c3d4e-1111-4aaa-8bbb-000000000001", "Radiohead"]`.

Ambiguous tag issue (observed):

```json
{"input": "vibes", "kind": "ambiguous", "input_kind": "tag", "field": "signal_tags", "scope": "urn:entity:artist", "purpose": "signal",
 "candidates": [
   {"id": "urn:tag:genre:music:jazz", "name": "Jazz Vibes", "type": "urn:tag:genre:music", "rank": 1, "popularity": 0.88, "parent_types": ["urn:entity:artist"]},
   {"id": "urn:tag:genre:music:smooth_jazz", "name": "Smooth Jazz Vibes", "type": "urn:tag:genre:music", "rank": 2, "popularity": 0.61, "parent_types": ["urn:entity:artist"]}],
 "provenance": {"…": "RES_PROV with endpoint /v2/tags"},
 "warnings": ["Qloo semantic search returned ranked candidates without a calibrated relevance score; choose one before the workflow continues."]}
```

Not-found issues (observed):

```json
{"input": "nomatch", "kind": "not_found", "input_kind": "entity", "field": "signals", "provenance": {"…": "RES_PROV /search"}}
```

```json
{"input": "jazz", "kind": "not_found", "input_kind": "tag", "field": "signal_tags", "scope": "urn:entity:videogame", "purpose": "signal", "provenance": {"…": "RES_PROV /v2/tags"}, "warnings": ["No candidate in the first 3 Qloo semantic tag results supports urn:entity:videogame."]}
```

Precondition example (observed):

```json
{"schema_version": "1.0-preview.1", "operation": "recommend", "status": "needs_input",
 "summary": "Demographic Qloo signals require signal_location so the audience geography is explicit.",
 "resolution": {"issues": []}, "results": [],
 "query_intent": {"…": "as §2"},
 "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-11", "duration_ms": 0}}
```

### `empty`

Only **where_popular** with 0 heatmap points (`qloo-tools.js:607`, observed) and **describe** with 0 results (`:565`, practically unreachable) produce `empty`. **Every other op returns `ok` with `results: []` and `result_count: 0`** (observed for recommend). An empty envelope has exactly the same keys as ok:

```json
{"schema_version": "1.0-preview.1", "operation": "where_popular", "status": "empty",
 "interpretation": {"entity": {"input": "Radiohead", "entityId": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "name": "Radiohead", "type": "urn:entity:artist", "match": "exact"}, "within": "Antarctica"},
 "resolution": {"contract_version": "1.0-preview.1", "provider": "<PROVIDER>", "outcomes": ["<resolved outcome>"]},
 "results": [], "result_count": 0,
 "provenance": {"source": "Qloo API", "endpoint": "/v2/insights", "documentation": "https://docs.qloo.com/reference/heatmaps-use-case",
   "requests": [{"method": "GET", "path": "/v2/insights", "query": {"filter.type": "urn:heatmap", "signal.interests.entities": "9a5b1c4e-0e7f-4c1a-9d3e-2b6f8a1c7d01", "filter.location.query": "Antarctica", "take": 10}}], "transport": "mcp"},
 "query_intent": {"…": "as §2"},
 "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-17", "duration_ms": 1}}
```

### `partial` and `degraded`: never produced

Both are declared in the envelope schema (CONTRACT:242-243), but **no code path in 0.1.26 emits them**. A grep of `dist/` finds them only in the schema itself, in a schema copy in `router.js:3670-3674`, in a consumer check in `guided-journey.js:401`, and in taste-resolver health probing (`resolution-provider.js:627-632`), which is unrelated to envelopes. In particular, trends does not report partial when one entity's request fails: the `Promise.all` rejects and the whole call errors. A mock should never emit these statuses in its normal behavior. If you want client robustness tests, the only safe assumption is that they would carry the ok-shaped keys (inferred).

---

## 6. Errors

Every error is a tool result with `isError:true`, never a JSON-RPC error. The exceptions are an unknown tool name and an unknown resource.

| code | layer | retryable | recovery string (verbatim) | Trigger | Source |
|---|---|---|---|---|---|
| `TOOL_INPUT` | `tool_input` | false | `Correct the reported tool arguments and submit the operation once more.` | Schema violation (enum, min/max, pattern, extra key, missing required). Summary: `Invalid <op> input: <path>: <msg>; …` (≤20 issues) | `workflow-executor.js:221-240` |
| `QLOO_AUTH` (no key) | `qloo` | false | `Run qloo setup or set QLOO_API_KEY, then restart the MCP server.` | No key configured. Summary: `Qloo workflow execution requires a configured Qloo API credential.` | `mcp.js:166-187` |
| `QLOO_AUTH` (HTTP) | `qloo` | false | `Run qloo doctor and configure a valid Qloo API credential before retrying.` | Upstream 401/403 | `workflow-executor.js:125-132` |
| `QLOO_RATE_LIMIT` | `qloo` | **true** | `Wait for the Qloo rate-limit window, then retry the same interpreted request once.` | 429, after the client's 3 attempts | `:134-141` |
| `QLOO_UPSTREAM` | `qloo` | **true** | `Retry once after the Qloo service recovers; use qloo doctor --network if it persists.` | HTTP ≥500, after retries | `:143-149` |
| `QLOO_CONTRACT` | `qloo` | false | `Inspect qloo_capabilities and the linked Qloo documentation before changing the request.` | Other HTTP 4xx (400, 404, …) | `:149-155` |
| `QLOO_CONTRACT` | `qloo` | false | `Inspect qloo_capabilities, endpoint trust, and the current Qloo contract before retrying.` | Invalid JSON, response over 5 MB, configuration error | `:157-165` |
| `QLOO_DNS` | `qloo` | **true** | `Run qloo doctor --network and verify the VPN-provided DNS route.` | `ENOTFOUND`, `EAI_AGAIN`, … | `:96-104`, CLIENT:170-178 |
| `QLOO_TIMEOUT` | `qloo` | **true** | `Run qloo doctor --network; retry after confirming VPN routing and service reachability.` | 20 s × 3 attempts (observed ≈60.7 s) | `:105-113` |
| `QLOO_TLS` | `qloo` | false | `Run qloo doctor --network and correct the local trust or proxy configuration before retrying.` | Certificate errors | `:114-122` |
| `QLOO_CONNECT` | `qloo` | true (it copies the client flag, which is always true for connection, proxy and network kinds) | `Run qloo doctor --network and verify VPN, proxy, routing, and firewall configuration.` | `ECONNREFUSED`/`ECONNRESET`/proxy/unclassified (observed: refused port, ≈0.7 s) | `:166-172` |
| `CANCELLED` | `qloo` / `resolver` / `transport` | false | `Retry only if the Qloo request was cancelled unintentionally.` (qloo layer) | Abort. **Unreachable over MCP**, which wires no signal | `:67-95, 174-182` |
| `RESOLVER_AUTH` / `RESOLVER_CONNECT` / `RESOLVER_TIMEOUT` / `RESOLVER_UPSTREAM` / `RESOLVER_CONTRACT` | `resolver` | AUTH and CONTRACT false; CONNECT, TIMEOUT and UPSTREAM (5xx and 429) true | See `resolution-provider.js:775-827` | Only with `QLOO_RESOLUTION_PROVIDER=taste-resolver`, and only for tag resolution | `workflow-executor.js:65-84` |
| `MCP_ADAPTER_FAILURE` | `harness` | false | `Run qloo doctor --network and inspect the local redacted trace.` | Any non-"expected" exception (internally `HARNESS_INTERNAL`, which is never surfaced as such): bad trends calendar dates or start>end, a result that fails the schema, bugs. Summary: `The Qloo MCP adapter failed before returning a workflow result.` | `mcp.js:188-209, 315-317`, `qloo-tools.js:876-878` |

Error summary format for executor-handled errors: `"Qloo API could not execute qloo_<op>: <message>"`. "Qloo API" here is the internal direct transport name, while `execution.transport_name` still says "Qloo canonical MCP". `<message>` is the upstream body's `message`/`reason`/`error` string, or `Qloo API request failed with <status> <statusText>.` (CLIENT:350-359). Errors raised **during entity or tag resolution** are classified the same way, because native resolution calls the same client (observed: a 500 on `/search` gives `QLOO_UPSTREAM`).

**Mapping to `safeRetryClasses`** `["dns","connect","timeout","rate_limit","upstream_5xx"]` (CONTRACT:446). The harness has no code that maps codes to classes, so this mapping is inferred from naming. It matches exactly the set with `retryable:true`:

| Class | Codes |
|---|---|
| dns | `QLOO_DNS` |
| connect | `QLOO_CONNECT`, `RESOLVER_CONNECT` |
| timeout | `QLOO_TIMEOUT`, `RESOLVER_TIMEOUT` |
| rate_limit | `QLOO_RATE_LIMIT` (also `RESOLVER_UPSTREAM` when it is a 429) |
| upstream_5xx | `QLOO_UPSTREAM`, `RESOLVER_UPSTREAM` |

Error envelope examples (observed):

```json
{"schema_version": "1.0-preview.1", "operation": "recommend", "status": "error",
 "summary": "Invalid recommend input: /bogus: must not have additional properties; /target_type: must be equal to one of the allowed values; /limit: must be <= 20",
 "query_intent": {"…": "built from the raw (invalid) input"},
 "error": {"code": "TOOL_INPUT", "layer": "tool_input", "retryable": false, "recovery": "Correct the reported tool arguments and submit the operation once more."},
 "results": [],
 "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-12", "duration_ms": 0}}
```

```json
{"schema_version": "1.0-preview.1", "operation": "find_tags", "status": "error",
 "summary": "Qloo API could not execute qloo_find_tags: Too many requests",
 "query_intent": {"…": "as §2"},
 "error": {"code": "QLOO_RATE_LIMIT", "layer": "qloo", "retryable": true, "recovery": "Wait for the Qloo rate-limit window, then retry the same interpreted request once."},
 "results": [],
 "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-25", "duration_ms": 946}}
```

```json
{"schema_version": "1.0-preview.1", "operation": "trends", "status": "error",
 "summary": "The Qloo MCP adapter failed before returning a workflow result.",
 "results": [], "result_count": 0,
 "error": {"code": "MCP_ADAPTER_FAILURE", "layer": "harness", "retryable": false, "recovery": "Run qloo doctor --network and inspect the local redacted trace."},
 "execution": {"transport": "mcp", "transport_name": "Qloo canonical MCP", "correlation_id": "mcp-22", "duration_ms": 0}}
```

The no-key `QLOO_AUTH` envelope is the one in `findtags-nokey.json`. It has `result_count:0` and no `query_intent`, and it is returned for any input.

`qloo_capabilities` with an unknown `operation_ids` value returns `{content:[{type:"text", text:"Unknown Qloo workflow operation IDs: nope"}], isError:true}`, with **no structuredContent** (`mcp.js:286-295`).

---

## 7. `qloo_capabilities` when a key is present (observed; `mcp.js:25-53`)

The payload is identical to the no-key dump (`capabilities.json`) except for `adapter`:

```json
"adapter": {
  "id": "qloo_harness_mcp",
  "compatibility": "canonical",
  "canonical_workflow_execution": true,
  "ready": true,
  "supported_operation_ids": ["recommend", "rank", "describe", "where_popular", "compare_audiences", "entity_tags", "audience_demographics", "trends", "find_tags"],
  "capabilities_tool": "qloo_capabilities",
  "contract_resource": "qloo://contracts/workflows",
  "tool_name_mapping": {"recommend": "qloo_recommend", "rank": "qloo_rank", "describe": "qloo_describe", "where_popular": "qloo_where_popular", "compare_audiences": "qloo_compare_audiences", "entity_tags": "qloo_entity_tags", "audience_demographics": "qloo_audience_demographics", "trends": "qloo_trends", "find_tags": "qloo_find_tags"},
  "fallback": "none"
}
```

When no key is present, the differences are `ready:false`, `canonical_workflow_execution:false` and `supported_operation_ids:[]`.

Top-level keys:
- `manifest_schema_version:"1.1"`
- `contract_version:"1.0.0"`
- `capabilities_tool`
- `result_schema_version:"1.0-preview.1"`
- `result_schema`
- `operations[]`, where each entry is `{id, shared_tool_name, summary, description, input_schema, behavior, documentation}`
- `upstream`
- `contract_checksum:"sha256:762bdcc5e14ff797b6de739d2658a83f78af35e68d7a5a3449455be6046924f5"`, which is the same with or without a key
- `adapter`

Passing `operation_ids` filters only `operations`. `supported_operation_ids` still lists all 9. The result carries no `isError` and no `execution`.

`behavior` per op (CONTRACT:436-463):

```
{ readOnly:true, idempotent:true, mutating:false, destructive:false, openWorld:true,
  concurrency:"safe_for_independent_inputs", requiredCredential:"qloo_api",
  defaultResultBudget:10, maximumResultBudget:20,
  safeRetryClasses:[…5…], supportedTransports:["direct","mcp"],
  expectedLatency:"medium"|"low" }
```

`expectedLatency` is `"low"` for describe, where_popular and find_tags, and `"medium"` for the rest.

---

## 8. Environment and configuration

Config resolution: CLIENT:105-137. Environment variables beat the config file.

| Var | Effect |
|---|---|
| `QLOO_API_KEY` | Credential, sent as the `X-Api-Key` header. If unset, the server falls back to `api_key` in `<QLOO_HOME>/config`. |
| `QLOO_HOME` | State root (default `~/.qloo`). It must not be `~` or `/`. Config file: `<QLOO_HOME>/config`, either `key=value` lines or JSON, with keys `api_key`, `base_url`, `trusted_base_url`, `taste_resolver_url`. Workflow logs: `<QLOO_HOME>/agent/logs/workflows-YYYY-MM-DD.jsonl`, one line per call with operation, transport `"direct"`, correlation_id, duration_ms, status/result_count or error_code/retryable (`observability.js`). |
| `QLOO_BASE_URL` | API base override (or config `base_url`). It must be HTTPS, **or plain HTTP on localhost / 127.0.0.1 / [::1]**, with no credentials, query or fragment (CLIENT:300-318). |
| `QLOO_TRUSTED_BASE_URL` | Must equal `QLOO_BASE_URL` (or config `trusted_base_url`) for a non-official base. Otherwise the server **crashes at startup**, printing `qloo: unexpected failure: Custom Qloo base URL is not trusted…` and exiting with code 1 (CLIENT:462-464, observed). |
| `QLOO_RESOLUTION_PROVIDER` | `native` (default) / `public` (alias) / `taste-resolver`. Any other value throws at startup. |
| `TASTE_RESOLVER_URL`, `TASTE_RESOLVER_API_KEY`, `QLOO_TRUSTED_TASTE_RESOLVER_URL`, `QLOO_TASTE_RESOLVER_TAG_ENDPOINT` (`legacy`\|`structured`), `QLOO_TASTE_RESOLVER_MIN_SCORE` (0.7), `QLOO_TASTE_RESOLVER_MIN_MARGIN` (0.05) | Optional hosted tag resolver. Entity resolution stays on Qloo (`resolution-provider.js:25-31, 905-930`). |
| `PI_OFFLINE` | Affects only update checks, not the MCP server. |

**There is no offline, fixture or replay mode** for the MCP server; "replay" in `runtime/pi-adapter.js` is an interactive-agent feature. The closest thing is the loopback override used for this doc: point `QLOO_BASE_URL` and `QLOO_TRUSTED_BASE_URL` at a local HTTP stub and set any `QLOO_API_KEY`. That runs the **real** harness logic over fake upstream data. It is a good option alongside a pure MCP mock: implement the fake Qloo HTTP endpoints (`/search`, `/entities`, `/v2/insights`, `/v2/tags`, `/v2/analysis/compare`, `/v2/trending`) and every envelope, resolution and error path comes out byte-exact.

---

## 9. Mock checklist and surprises

1. With no key, every workflow tool returns the same `QLOO_AUTH` envelope, even for invalid input. Validation only happens when a key is present.
2. `ok` envelopes have **no `summary`**. Only needs_input and error carry one.
3. trends uses `series[{entity, points}]` instead of `results`. compare_audiences returns raw upstream `results` (maybe an object) and has no `result_count`.
4. `empty` exists only for where_popular (and in theory describe). Every other op returns `ok` with `[]`. `partial` and `degraded` are never emitted.
5. The needs_input candidate list is in `resolution.issues[].candidates`, not in `results`. To re-submit, swap the input string for the candidate `id`.
6. Native mode never auto-picks a tag unless its name matches exactly, so free-text tag concepts usually give needs_input. A single non-exact entity hit is still "ambiguous".
7. Entity UUIDs must be RFC-4122 shaped (version 1-5, variant 8/9/a/b) to skip name search. `urn:tag:` inputs skip lookup entirely, and their interpreted `name` is the URN.
8. `interpretation` uses camelCase `entityId`/`tagId`, while results use snake_case `entity_id`/`id`. `interpretation.*_type` is a URN; `query_intent.target.type` is the raw id. `query_intent.unresolved` is always `[]`.
9. describe by UUID returns only `{entity_id, name, type}`; describe by name returns hydrated `properties`.
10. Trends `limit` (default 10, max 20) also caps points per series. Invalid calendar dates give `MCP_ADAPTER_FAILURE`, not `TOOL_INPUT`.
11. A 429, 5xx or timeout is retried inside the client before the error surfaces: about 1-2 s for 429/5xx with short backoff, longer if Retry-After applies, and about 60 s for a timeout.
12. The resolution cache (15 min) adds `provenance.cache_status:"memory_hit"` to repeated outcomes within one server process.
13. The error `summary` prefix is `"Qloo API could not execute qloo_<op>: "`, even though `execution.transport_name` is "Qloo canonical MCP".
