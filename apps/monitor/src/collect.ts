import { batchSchema, MAX_BYTES, type TelemetryEvent } from "@wedraft/telemetry";

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer" } });
}
export function dayOf(time: number) { return new Date(time + 8 * 3600_000).toISOString().slice(0, 10); }

export function variant(e: TelemetryEvent): string {
  const p = e.properties;
  switch(e.name) {
    case "page_view": return e.properties.route;
    case "article_started": return `${e.properties.method}:${e.properties.partial ? "partial" : "full"}`;
    case "format_action": return `${e.properties.action}:${e.properties.source}:${e.properties.changed}`;
    case "article_checkpoint": return `${e.properties.chars}:${e.properties.images}:${e.properties.tables}`;
    case "import_result": return `${e.properties.format}:${e.properties.method}:${e.properties.result}`;
    case "export_result": return `${e.properties.kind}:${e.properties.result}:${e.properties.status}`;
    case "validation_changed": return `${e.properties.status}:${e.properties.reason}`;
    case "ai_action": return `${e.properties.action}:${e.properties.result}`;
    default: return String("result" in p ? p.result : "method" in p ? p.method : "action" in p ? p.action : "surface" in p ? p.surface : "template" in p ? p.template : "code" in p ? p.code : "all");
  }
}

export async function readBounded(request: Request): Promise<unknown> {
  if (Number(request.headers.get("Content-Length")) > MAX_BYTES || !request.body) throw new Error("body_size");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("body_size"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal:true, ignoreBOM:false }).decode(bytes));
}

export async function collect(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error:"method" },405);
  if (env.ENABLED !== "true") return json({ error:"disabled" },503);
  if (request.headers.get("Origin") !== env.COLLECT_ORIGIN || new URL(request.url).search ||
      !request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error:"origin_or_type" },403);
  // Used transiently by the edge limiter only; never saved or hashed into analytics.
  if (!(await env.INGEST_LIMIT.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" })).success) return json({ error:"rate_limit" },429);
  let parsed: ReturnType<typeof batchSchema.safeParse>;
  try { parsed = batchSchema.safeParse(await readBounded(request)); }
  catch { return json({ error:"invalid_body" },400); }
  if (!parsed.success) return json({ error:"invalid_event" },400);
  const now = Date.now(), day = dayOf(now);
  try {
    const results = await env.DB.batch(parsed.data.events.map(e => env.DB.prepare(
      "INSERT OR IGNORE INTO events(id,session,article,seq,version,name,properties,variant,received_at,day) VALUES(?,?,?,?,?,?,?,?,?,?)"
    ).bind(e.id,e.session,e.article,e.seq,e.version,e.name,JSON.stringify(e.properties),variant(e),now,day)));
    const bytes = results.at(-1)?.meta.size_after;
    if (typeof bytes === "number") {
      // A failed size refresh must not turn a committed batch into a false rejection.
      try { await env.DB.prepare("UPDATE control SET storage_bytes=? WHERE id=1").bind(bytes).run(); } catch { /* Next successful write refreshes it. */ }
    }
    return json({ accepted:parsed.data.events.map(e=>e.id) });
  } catch (error) {
    const budget = error instanceof Error && error.message.includes("monitor_budget");
    return json({ error:budget ? "budget" : "storage_unavailable" },budget ? 429 : 503);
  }
}
