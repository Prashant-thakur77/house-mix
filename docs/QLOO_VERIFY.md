# Qloo verify report

Run: 2026-10-30T06:31:00.462Z · harness 0.1.26 · contract 1.0.0

| Tool | Status | Adapter check |
| --- | --- | --- |
| `qloo_describe` | ok | ✅ adapter extracts data |
| `qloo_describe` | ok | ✅ adapter extracts data |
| `qloo_find_tags` | ok | ✅ adapter extracts data |
| `qloo_recommend` | ok | ✅ adapter extracts data |
| `qloo_rank` | ok | ✅ adapter extracts data |
| `qloo_where_popular` | ok | ✅ adapter extracts data |
| `qloo_compare_audiences` | ok | ✅ adapter extracts data |
| `qloo_entity_tags` | ok | ✅ adapter extracts data |
| `qloo_audience_demographics` | ok | ✅ adapter extracts data |
| `qloo_trends` | ok | ✅ adapter extracts data |
| `qloo_describe` | needs_input | ✅ adapter extracts data |

## Differences from the mock

- qloo_describe: live envelope has keys the mock lacks: summary
- qloo_describe: live envelope has keys the mock lacks: summary
- qloo_find_tags: live envelope has keys the mock lacks: summary
- qloo_recommend: live result items have keys the mock lacks: affinity, entity_id, explainability, name, popularity, properties, subtype, type
- qloo_rank: live result items have keys the mock lacks: affinity, entity_id, name, popularity, properties, subtype, type
- qloo_where_popular: live result items have keys the mock lacks: location, query
- qloo_compare_audiences: live result items have keys the mock lacks: entity_id, name, popularity, query, subtype, tag_id, type
- qloo_entity_tags: live result items have keys the mock lacks: affinity, id, name, popularity, type
- qloo_audience_demographics: live result items have keys the mock lacks: entity_id, query
- qloo_describe: live envelope has keys the mock lacks: result_count

## Problems

- None. House Mix's adapters read every live shape.

Live fixtures: `fixtures/live/*.json` (requests and envelopes; no credentials).
