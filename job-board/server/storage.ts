import { tracked, profiles, DEFAULT_PROFILE } from "@shared/schema";
import type { Tracked, InsertTracked, Profile } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
sqlite.exec(`
CREATE TABLE IF NOT EXISTS tracked (
  job_id TEXT PRIMARY KEY, status TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL, company TEXT NOT NULL, url TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
`);

export const db = drizzle(sqlite);

export interface IStorage {
  listTracked(): Tracked[];
  upsertTracked(t: InsertTracked): Tracked;
  deleteTracked(jobId: string): void;
  getProfile(): Profile;
  setProfile(p: Profile): Profile;
}

export class DatabaseStorage implements IStorage {
  listTracked() {
    return db.select().from(tracked).all();
  }
  upsertTracked(t: InsertTracked) {
    return db.insert(tracked).values(t)
      .onConflictDoUpdate({ target: tracked.jobId, set: { status: t.status, notes: t.notes ?? "", updatedAt: t.updatedAt } })
      .returning().get();
  }
  deleteTracked(jobId: string) {
    db.delete(tracked).where(eq(tracked.jobId, jobId)).run();
  }
  getProfile(): Profile {
    const row = db.select().from(profiles).where(eq(profiles.id, 1)).get();
    if (!row) return DEFAULT_PROFILE;
    try { return { ...DEFAULT_PROFILE, ...JSON.parse(row.data) }; } catch { return DEFAULT_PROFILE; }
  }
  setProfile(p: Profile) {
    db.insert(profiles).values({ id: 1, data: JSON.stringify(p) })
      .onConflictDoUpdate({ target: profiles.id, set: { data: JSON.stringify(p) } }).run();
    return p;
  }
}

export const storage = new DatabaseStorage();
