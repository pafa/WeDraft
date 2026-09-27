import { incident } from './alerts.js';
import { DAY } from '@wedraft/telemetry';
import { dayOf } from './collect.js';

// Only bounded, indexed windows are exposed; no arbitrary SQL or article content.
export async function stats(env: Env, url: URL) {
  const now=Date.now(), since=now-7*DAY, firstDay=dayOf(now-6*DAY);
  const session=url.searchParams.get('session');
  if(session) {
    if(!/^[0-9a-f-]{36}$/i.test(session)) return {events:[]};
    const events=await env.DB.prepare('SELECT article,seq,name,properties,received_at FROM events WHERE session=? AND received_at>=? ORDER BY seq LIMIT 200').bind(session,now-30*DAY).all();
    return {events:events.results};
  }
  const results=await env.DB.batch([
    env.DB.prepare('SELECT * FROM control WHERE id=1'),
    env.DB.prepare('SELECT accepted FROM ingest_days WHERE day=?').bind(dayOf(now)),
    env.DB.prepare('SELECT name,variant,SUM(n) AS n FROM daily_events WHERE day>=? GROUP BY name,variant ORDER BY n DESC LIMIT 150').bind(firstDay),
    env.DB.prepare('SELECT * FROM daily_tasks WHERE day>=? ORDER BY day DESC,method').bind(firstDay),
    env.DB.prepare('SELECT session,MAX(received_at) AS last_seen,COUNT(*) AS n FROM (SELECT session,received_at FROM events WHERE received_at>=? ORDER BY received_at DESC LIMIT 5000) GROUP BY session ORDER BY last_seen DESC LIMIT 30').bind(since),
    env.DB.prepare('SELECT * FROM health ORDER BY key'),
    env.DB.prepare('SELECT key,active,failures,updated_at,notified FROM incidents WHERE active=1'),
  ]);
  return {at:now,control:results[0]!.results[0],today:results[1]!.results[0]??{accepted:0},counts:results[2]!.results,cohorts:results[3]!.results,sessions:results[4]!.results,health:results[5]!.results,incidents:results[6]!.results};
}

export async function setHealth(env:Env,key:string,value:string) {
  await env.DB.prepare('INSERT INTO health(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,value,Date.now()).run();
}

// Completed 24-hour cohorts only. Event order is client sequence, never request arrival order.
export async function aggregate(env:Env,now:number) {
  const fromTime=Math.floor((now+8*3600_000)/DAY)*DAY-8*3600_000-3*DAY;
  const from=dayOf(fromTime), until=now-DAY-15*60_000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM daily_tasks WHERE day>=?').bind(from),
    env.DB.prepare(`INSERT INTO daily_tasks(day,method,started,mature,ready,output,handoff,toolbar,preview)
      WITH starts AS (
        SELECT session,article,MIN(seq) seq,MIN(received_at) t,day,json_extract(properties,'$.method') method
        FROM events WHERE received_at>=? AND name='article_started' AND json_extract(properties,'$.partial')=0
        GROUP BY session,article
      ), tasks AS (
        SELECT s.day,s.method,s.t,
        MAX(CASE WHEN e.name='preview_ready' THEN 1 ELSE 0 END) ready,
        MAX(CASE WHEN e.name='copy_result' AND json_extract(e.properties,'$.result')='success' THEN 1 ELSE 0 END) output,
        MAX(CASE WHEN e.name='export_result' AND json_extract(e.properties,'$.result')='handed_off' THEN 1 ELSE 0 END) handoff,
        MAX(CASE WHEN e.name='format_action' AND json_extract(e.properties,'$.changed')=1 THEN 1 ELSE 0 END) toolbar,
        MAX(CASE WHEN e.name='manual_edit' AND json_extract(e.properties,'$.surface')='preview' THEN 1 ELSE 0 END) preview
        FROM starts s LEFT JOIN events e ON e.session=s.session AND e.article=s.article AND e.seq>s.seq AND e.received_at<=s.t+?
        GROUP BY s.session,s.article
      ) SELECT day,method,COUNT(*),SUM(t<=?),SUM(CASE WHEN t<=? THEN ready ELSE 0 END),SUM(CASE WHEN t<=? THEN output ELSE 0 END),SUM(CASE WHEN t<=? THEN handoff ELSE 0 END),SUM(toolbar),SUM(preview) FROM tasks GROUP BY day,method`)
      .bind(fromTime,DAY,until,until,until,until),
  ]);
}

export async function maintain(env:Env) {
  const now=Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE id IN (SELECT id FROM events WHERE received_at<? ORDER BY received_at LIMIT 250)').bind(now-30*DAY),
    env.DB.prepare('DELETE FROM daily_events WHERE day<?').bind(dayOf(now-365*DAY)),
    env.DB.prepare('DELETE FROM daily_tasks WHERE day<?').bind(dayOf(now-365*DAY)),
    env.DB.prepare('DELETE FROM ingest_days WHERE day<?').bind(dayOf(now-31*DAY)),
  ]);
  const last=await env.DB.prepare("SELECT updated_at FROM health WHERE key='aggregation'").first<{updated_at:number}>();
  if(!last || now-last.updated_at>=3600_000) {
    await aggregate(env,now); await setHealth(env,'aggregation','ok');
  }
  // No synthetic customer activity: check the actual public site and a separate DB heartbeat.
  if(env.ENVIRONMENT==='production') {
    let ok=false;
    try { const response=await fetch(env.COLLECT_ORIGIN+'/release.json',{signal:AbortSignal.timeout(8000),redirect:'error'}); ok=response.ok; await response.body?.cancel(); } catch { /* Fixed health code only. */ }
    await setHealth(env,'site',ok?'ok':'failed');
    await incident(env,'site_unavailable',!ok,3);
  }
  const control=await env.DB.prepare('SELECT stored,storage_bytes FROM control WHERE id=1').first<{stored:number;storage_bytes:number}>();
  const today=await env.DB.prepare('SELECT accepted FROM ingest_days WHERE day=?').bind(dayOf(now)).first<{accepted:number}>();
  const ratio=Math.max((today?.accepted??0)/5000,(control?.stored??0)/150000,(control?.storage_bytes??0)/350000000);
  await setHealth(env,'budget',ratio>=.9?'critical':ratio>=.7?'warning':'ok');
  await incident(env,'budget_70_percent',ratio>=.7);
  await incident(env,'budget_90_percent',ratio>=.9);
  await setHealth(env,'heartbeat','ok');
  // Email activation requires a verified Email Routing destination and approved sender domain.
  if(!env.ALERT_FROM||!env.ALERT_TO) await setHealth(env,'email','not_configured');
}
