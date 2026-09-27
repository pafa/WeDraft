export type Incident={active:number;failures:number;notified:number;attempts:number;updated_at:number};
// Bound, deduplicated notifications, including recovery. Claim before sending to avoid concurrent repeats.
export async function incident(env:Env,key:string,bad:boolean,threshold=1) {
  const now=Date.now();
  const old=await env.DB.prepare('SELECT * FROM incidents WHERE key=?').bind(key).first<Incident>();
  const failures=bad?(old?.failures??0)+1:0;
  const active=bad&&failures>=threshold?1:0;
  const changed=active!==(old?.active??0);
  await env.DB.prepare(`INSERT INTO incidents(key,active,failures,updated_at,notified,attempts) VALUES(?,?,?,?,0,0)
    ON CONFLICT(key) DO UPDATE SET active=excluded.active,failures=excluded.failures,updated_at=CASE WHEN active!=excluded.active THEN excluded.updated_at ELSE updated_at END,notified=CASE WHEN active!=excluded.active THEN 0 ELSE notified END,attempts=CASE WHEN active!=excluded.active THEN 0 ELSE attempts END`).bind(key,active,failures,now).run();
  if(!active&&!changed&&!(old?.active===0&&old.notified===0&&old.attempts>0))return;
  if(env.ENVIRONMENT!=='production'||!env.ALERT_TO||!env.ALERT_FROM)return;
  if(!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+$/.test(env.ALERT_TO)||!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+$/.test(env.ALERT_FROM))return;
  const claim=await env.DB.prepare('UPDATE incidents SET attempts=attempts+1,notified=-1 WHERE key=? AND notified=0 AND attempts<3 RETURNING attempts').bind(key).first();
  if(!claim)return;
  try {
    await env.ALERT_EMAIL.send({from:env.ALERT_FROM,to:env.ALERT_TO,subject:`WeDraft ${active?'alert':'recovered'}: ${key}`,text:`WeDraft monitoring: ${key} ${active?'needs attention':'recovered'}.\nDashboard: ${env.COLLECT_ORIGIN}/monitor\nNo article content is included.\nNo paid plan was enabled.`});
    await env.DB.prepare('UPDATE incidents SET notified=1 WHERE key=? AND active=?').bind(key,active).run();
    await env.DB.prepare("INSERT INTO health VALUES('email','accepted_by_provider',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(now).run();
  }catch{
    await env.DB.prepare('UPDATE incidents SET notified=0 WHERE key=? AND active=?').bind(key,active).run();
    await env.DB.prepare("INSERT INTO health VALUES('email','send_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(now).run();
  }
}
