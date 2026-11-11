import type { Express } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import { isOwner, requireOwner } from "./owner";
import { insertTrackedSchema, profileSchema } from "@shared/schema";
import { getJobs, getDescription, initJobs, requestRefresh, syncIfStale } from "./jobs";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  initJobs();

  app.get("/api/jobs", (_req, res) => { syncIfStale(); res.json(getJobs()); });

  app.get("/api/jobs/:id/description", (req, res) => {
    const d = getDescription(String(req.params.id));
    if (d == null) return res.status(404).json({ message: "Not found" });
    res.json({ description: d });
  });

  app.get("/api/owner", (req, res) => res.json({ owner: isOwner(req) }));

  app.post("/api/refresh", requireOwner, (_req, res) => {
    const started = requestRefresh();
    res.json({ ok: true, started });
  });

  // The pipeline is private: visitors get an empty list.
  app.get("/api/tracked", (req, res) => res.json(isOwner(req) ? storage.listTracked() : []));

  app.post("/api/tracked", requireOwner, (req, res) => {
    const parsed = insertTrackedSchema.safeParse({ ...req.body, updatedAt: Date.now() });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const existing = storage.listTracked();
    if (existing.length >= 2000 && !existing.some((t) => t.jobId === parsed.data.jobId)) return res.status(429).json({ message: "Pipeline is full" });
    res.json(storage.upsertTracked(parsed.data));
  });

  app.delete("/api/tracked/:id", requireOwner, (req, res) => {
    storage.deleteTracked(String(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/profile", (_req, res) => res.json(storage.getProfile()));

  app.put("/api/profile", requireOwner, (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(storage.setProfile(parsed.data));
  });

  return httpServer;
}
