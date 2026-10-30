/**
 * The visitor's own Anthropic API key. It is kept in this browser only (localStorage) and sent, in one header, only with
 * the requests that use Claude (planning, Ask, Without Qloo, the briefing). The House Mix API uses it for that request
 * and never stores or logs it.
 */

const STORE = "hm-anthropic-key";
export const KEY_HEADER = "x-anthropic-key";
/** Fired when the key changes, and when the API asks for one (detail: the API's message). */
export const KEY_EVENT = "hm-user-key";
export const NEED_KEY_EVENT = "hm-need-key";
/** Fired when a demo show refuses a change (detail: the show ID). */
export const READ_ONLY_EVENT = "hm-seed-read-only";

export function getUserKey(): string | undefined {
  try {
    return localStorage.getItem(STORE) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setUserKey(key: string | undefined) {
  try {
    if (key) localStorage.setItem(STORE, key);
    else localStorage.removeItem(STORE);
  } catch {
    // Storage blocked: the key can't be kept, and Claude features ask again.
  }
  window.dispatchEvent(new Event(KEY_EVENT));
}

/** The header to send with a Claude request, when the visitor has added a key. */
export function claudeHeaders(): Record<string, string> {
  const key = getUserKey();
  return key ? { [KEY_HEADER]: key } : {};
}

export const looksLikeKey = (key: string) => /^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(key.trim());

/** Tells the page what an API error needs from the visitor: a key (or a working one), or their own copy of a demo show. */
export function announce(code: string, message: string, showId?: string) {
  if (typeof window === "undefined") return;
  if (code === "user_key_required" || code === "user_key_invalid" || code === "user_key_no_credit") {
    window.dispatchEvent(new CustomEvent(NEED_KEY_EVENT, { detail: message }));
  } else if (code === "seed_read_only" && showId) {
    window.dispatchEvent(new CustomEvent(READ_ONLY_EVENT, { detail: showId }));
  }
}

/** True when the page already explained this error (the key dialog or the "make my copy" prompt opened). */
export const explained = (e: unknown) =>
  ["user_key_required", "user_key_invalid", "user_key_no_credit", "seed_read_only"].includes((e as { code?: string } | undefined)?.code ?? "");
