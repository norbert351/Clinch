/**
 * Developer Platform for Clinch
 * Simple file-based API key management + webhook dispatch.
 * External builders get an API key, configure webhooks, and
 * integrate escrow + AI dispute into their products.
 */
import { randomBytes, createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DEV_FILE = "./developers.json";

interface WebhookConfig {
  url: string;
  events: string[];
  enabled: boolean;
  secret: string;
}

interface Developer {
  name: string;
  email: string;
  apiKey: string;
  apiKeyPrefix: string;
  webhooks: WebhookConfig[];
  createdAt: string;
  enabled: boolean;
}

let developers: Developer[] = [];

function loadDevs() {
  if (!existsSync(DEV_FILE)) writeFileSync(DEV_FILE, "[]", "utf8");
  try { developers = JSON.parse(readFileSync(DEV_FILE, "utf8")); }
  catch { developers = []; }
}
function saveDevs() { writeFileSync(DEV_FILE, JSON.stringify(developers, null, 2), "utf8"); }
loadDevs();

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ── Generate API key ──
export function generateApiKey(name: string, email: string) {
  const raw = "clinch_" + randomBytes(24).toString("hex");
  const hash = hashKey(raw);
  developers = developers.filter(d => d.email !== email);
  developers.push({ name, email, apiKey: hash, apiKeyPrefix: raw.slice(0, 12), webhooks: [], createdAt: new Date().toISOString(), enabled: true });
  saveDevs();
  return raw;
}

// ── Validate API key ──
export function validateApiKey(rawKey: string): Developer | null {
  const h = hashKey(rawKey);
  const d = developers.find(x => x.apiKey === h);
  return d && d.enabled ? d : null;
}

// ── Revoke API key ──
export function revokeApiKey(rawKey: string): boolean {
  const h = hashKey(rawKey);
  const idx = developers.findIndex(x => x.apiKey === h);
  if (idx === -1) return false;
  developers.splice(idx, 1);
  saveDevs();
  return true;
}

// ── Webhooks ──
export function addWebhook(devKey: string, url: string, events: string[]) {
  const d = developers.find(x => x.apiKey === devKey);
  if (!d) return false;
  d.webhooks.push({ url, events, enabled: true, secret: randomBytes(16).toString("hex") });
  saveDevs();
  return true;
}

export function removeWebhook(devKey: string, url: string) {
  const d = developers.find(x => x.apiKey === devKey);
  if (!d) return false;
  d.webhooks = d.webhooks.filter(w => w.url !== url);
  saveDevs();
  return true;
}

// ── Dispatch webhooks ──
export async function dispatchWebhooks(eventType: string, payload: any) {
  for (const dev of developers) {
    if (!dev.enabled) continue;
    for (const wh of dev.webhooks) {
      if (!wh.enabled || !wh.events.includes(eventType)) continue;
      fireWebhook(wh, eventType, payload).catch(() => {});
    }
  }
}

async function fireWebhook(wh: WebhookConfig, event: string, data: any) {
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
  const sig = createHmac("sha256", wh.secret).update(body).digest("hex");
  try {
    await fetch(wh.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Clinch-Signature": sig, "X-Clinch-Event": event },
      body,
    });
  } catch {}
}

// ── Express middleware ──
export function apiKeyMiddleware(req: any, res: any, next: any) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (!key) return res.status(401).json({ error: "Missing X-API-Key header" });
  const dev = validateApiKey(key);
  if (!dev) return res.status(403).json({ error: "Invalid or revoked API key" });
  req.developer = dev;
  next();
}