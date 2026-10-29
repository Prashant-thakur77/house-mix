/** Minimal setlist.fm API client (non-commercial eval use). Key in x-api-key, JSON via Accept. */
const BASE = "https://api.setlist.fm/rest/1.0";
let last = 0;

export interface Setlist {
  id: string;
  eventDate: string; // dd-MM-yyyy
  artist: { mbid: string; name: string };
  venue: { id: string; name: string; city: { name: string; country: { code: string } } };
  tour?: { name: string };
}

export async function sfm<T>(pathAndQuery: string, fetchImpl: typeof fetch = fetch): Promise<T | undefined> {
  const key = process.env.SETLISTFM_API_KEY;
  if (!key) throw new Error("SETLISTFM_API_KEY is not set.");
  // setlist.fm allows about 2 requests per second; stay under it.
  const wait = Math.max(0, last + 600 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchImpl(`${BASE}${pathAndQuery}`, { headers: { "x-api-key": key, Accept: "application/json" } });
    if (res.status === 404) return undefined;
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`setlist.fm ${res.status} for ${pathAndQuery}`);
    return (await res.json()) as T;
  }
  throw new Error(`setlist.fm rate-limited on ${pathAndQuery}`);
}

export async function setlistsFor(artist: string, year: number, page = 1, f?: typeof fetch) {
  const q = new URLSearchParams({ artistName: artist, year: String(year), p: String(page) });
  return (await sfm<{ setlist?: Setlist[]; total: number }>(`/search/setlists?${q}`, f))?.setlist ?? [];
}

export async function sameNight(venueId: string, date: string, f?: typeof fetch) {
  const q = new URLSearchParams({ venueId, date });
  return (await sfm<{ setlist?: Setlist[] }>(`/search/setlists?${q}`, f))?.setlist ?? [];
}
