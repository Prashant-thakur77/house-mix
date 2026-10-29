import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";

export type Collection = "shows" | "runs" | "ledger" | "cache" | "ratings" | "briefings" | "spend";

/** Minimal document store. FileStore for local dev and CI, FirestoreStore in production. */
export interface Store {
  readonly kind: string;
  get<T>(col: Collection, id: string): Promise<T | undefined>;
  put<T>(col: Collection, id: string, doc: T): Promise<void>;
  delete(col: Collection, id: string): Promise<void>;
  list<T>(col: Collection, opts?: { where?: [string, string]; limit?: number }): Promise<T[]>;
}

const safeId = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, "_");

export class FileStore implements Store {
  readonly kind = "file";
  constructor(private readonly root: string) {}

  private file(col: Collection, id: string) {
    return path.join(this.root, col, `${safeId(id)}.json`);
  }

  async get<T>(col: Collection, id: string): Promise<T | undefined> {
    try {
      return JSON.parse(await fs.readFile(this.file(col, id), "utf8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  }

  async put<T>(col: Collection, id: string, doc: T): Promise<void> {
    const f = this.file(col, id);
    await fs.mkdir(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(doc, null, 1));
    await fs.rename(tmp, f);
  }

  async delete(col: Collection, id: string): Promise<void> {
    await fs.rm(this.file(col, id), { force: true });
  }

  async list<T>(col: Collection, opts: { where?: [string, string]; limit?: number } = {}): Promise<T[]> {
    const dir = path.join(this.root, col);
    let names: string[] = [];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const docs: T[] = [];
    for (const n of names) {
      try {
        const doc = JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as Record<string, unknown>;
        if (opts.where && String(doc[opts.where[0]]) !== opts.where[1]) continue;
        docs.push(doc as T);
      } catch {
        // a file mid-write; skip it
      }
    }
    return opts.limit ? docs.slice(0, opts.limit) : docs;
  }
}

export class FirestoreStore implements Store {
  readonly kind = "firestore";
  private db: import("@google-cloud/firestore").Firestore | undefined;

  private async fs() {
    if (!this.db) {
      const { Firestore } = await import("@google-cloud/firestore");
      this.db = new Firestore({ projectId: config.gcpProject || undefined, ignoreUndefinedProperties: true });
    }
    return this.db;
  }

  private colName(col: Collection) {
    return `hm_${col}`;
  }

  /**
   * Documents are stored as a JSON string: Qloo envelopes contain nested arrays, which Firestore
   * rejects. Only the string fields we filter on are kept as real Firestore fields.
   */
  private static readonly INDEXED = ["shareId", "runId", "showId", "pairId"];

  private decode<T>(data: Record<string, unknown> | undefined): T | undefined {
    if (!data) return undefined;
    return typeof data._json === "string" ? (JSON.parse(data._json) as T) : (data as T);
  }

  async get<T>(col: Collection, id: string): Promise<T | undefined> {
    const snap = await (await this.fs()).collection(this.colName(col)).doc(safeId(id)).get();
    return snap.exists ? this.decode<T>(snap.data()) : undefined;
  }

  async put<T>(col: Collection, id: string, doc: T): Promise<void> {
    const json = JSON.stringify(doc);
    const rec = doc as Record<string, unknown>;
    const indexed = Object.fromEntries(FirestoreStore.INDEXED.filter((k) => typeof rec[k] === "string").map((k) => [k, rec[k]]));
    await (await this.fs()).collection(this.colName(col)).doc(safeId(id)).set({ ...indexed, _json: json });
  }

  async delete(col: Collection, id: string): Promise<void> {
    await (await this.fs()).collection(this.colName(col)).doc(safeId(id)).delete();
  }

  async list<T>(col: Collection, opts: { where?: [string, string]; limit?: number } = {}): Promise<T[]> {
    let q: import("@google-cloud/firestore").Query = (await this.fs()).collection(this.colName(col));
    if (opts.where) q = q.where(opts.where[0], "==", opts.where[1]);
    if (opts.limit) q = q.limit(opts.limit);
    const snap = await q.get();
    return snap.docs.map((d) => this.decode<T>(d.data())!);
  }
}

let store: Store | undefined;
export function getStore(): Store {
  if (!store) store = config.store === "firestore" ? new FirestoreStore() : new FileStore(config.dataDir);
  return store;
}
export function setStore(s: Store) {
  store = s;
}
