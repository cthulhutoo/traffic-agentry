import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { buildSampleData } from "./sampleData";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // GET /api/metrics  — 30-day traffic snapshot for the Agentry dashboard.
  // Replace buildSampleData() with a real adapter to your VPS access logs (see sampleData.ts header).
  app.get("/api/metrics", (_req, res) => {
    const data = buildSampleData(30);
    res.set("Cache-Control", "no-store");
    res.json(data);
  });

  // GET /api/health  — liveness probe
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  return httpServer;
}
