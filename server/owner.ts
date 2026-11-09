import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";

// Only a SHA-256 hash of the owner key lives on disk; the key itself is never stored.
function loadHash(): string | null {
  if (process.env.OWNER_KEY_HASH) return process.env.OWNER_KEY_HASH.trim();
  try { return fs.readFileSync(path.resolve(process.cwd(), "owner-key.hash"), "utf8").trim(); } catch { return null; }
}
const HASH = loadHash();

export function isOwner(req: Request): boolean {
  const key = req.get("x-owner-key");
  if (!HASH || !key || key.length > 200) return false;
  const a = Buffer.from(crypto.createHash("sha256").update(key).digest("hex"));
  const b = Buffer.from(HASH);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (isOwner(req)) return next();
  res.status(403).json({ message: "Owner key required" });
}
