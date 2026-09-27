import {URL as NodeURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {incident} from '../src/alerts.js';
import {it,expect,vi} from 'vitest';
import {aggregate} from '../src/stats.js';
import {authorized} from '../src/auth.js';
const migration=readFileSync(new NodeURL('../migrations/0001_monitoring.sql',import.meta.url),'utf8');
function db(){const d=new DatabaseSync(':memory:');d.exec(migration);return d;}
function insert(d:DatabaseSync,id:string,seq:number,name='page_view',properties='{}',time=Date.now(),article:string|null=null){d.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'s',article,seq,'0.2.0',name,properties,'all',time,'2026-09-27');}
it('deduplicates retries and enforces the cap atomically even across a batch',()=>{
 const d=db();insert(d,'one',1);insert(d,'one',1);insert(d,'other-id',1);
 expect(d.prepare('SELECT stored FROM control').get()?.stored).toBe(1);
 d.prepare('UPDATE ingest_days SET accepted=4999').run();
 d.exec('BEGIN');insert(d,'two',2);expect(()=>insert(d,'three',3)).toThrow('monitor_budget');d.exec('ROLLBACK');
 expect(d.prepare('SELECT stored FROM control').get()?.stored).toBe(1);
 expect(d.prepare('SELECT accepted FROM ingest_days').get()?.accepted).toBe(4999);
 d.exec('UPDATE control SET storage_bytes=350000000');expect(()=>insert(d,'two',2)).toThrow();insert(d,'one',1);
 d.close();
});
it('aggregates only complete 24h cohorts, preserving article boundaries and event order',async()=>{
 const d=db(),now=Date.now(),old=now-25*3600000;
 insert(d,'a',1,'article_started','{"method":"paste_plain","partial":false}',old,'a');
 insert(d,'b',2,'copy_result','{"result":"success"}',old+100,'b'); // Another article is not success for a.
 insert(d,'c',3,'preview_ready','{}',old+200,'a');
 insert(d,'e',4,'article_started','{"method":"typing","partial":true}',old,'b');
 insert(d,'f',5,'article_started','{"method":"typing","partial":false}',now-1000,'c');
 const env={DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({sql,args})}),batch:async(statements:any[])=>{d.exec('BEGIN');try{for(const s of statements)d.prepare(s.sql).run(...s.args);d.exec('COMMIT');}catch(e){d.exec('ROLLBACK');throw e;}}}} as unknown as Env;
 await aggregate(env,now);
 const rows=d.prepare('SELECT * FROM daily_tasks ORDER BY method').all();
 expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({method:'paste_plain',started:1,mature:1,ready:1,output:0});expect(rows[1]).toMatchObject({method:'typing',started:1,mature:0,ready:0});d.close();
});
it('never trusts the email header or a local flag on a public hostname',async()=>{
 expect(await authorized(new Request('https://wedraft.xiaoha.org/monitor',{headers:{'Cf-Access-Authenticated-User-Email':'owner@example.com'}}),{ENVIRONMENT:'local'} as Env)).toBe(false);
 expect(await authorized(new Request('http://127.0.0.1:8787/monitor'),{ENVIRONMENT:'local'} as Env)).toBe(true);
 expect(await authorized(new Request('http://127.0.0.1:8787/monitor'),{ENVIRONMENT:'production'} as Env)).toBe(false);
});

it('deduplicates alerts, waits for three failed probes, and sends one recovery',async()=>{
 const d=db(),send=vi.fn().mockResolvedValue({messageId:'test'});
 const env={ENVIRONMENT:'production',ALERT_FROM:'monitor@example.com',ALERT_TO:'owner@example.com',COLLECT_ORIGIN:'https://example.com',ALERT_EMAIL:{send},DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({first:async()=>d.prepare(sql).get(...args),run:async()=>d.prepare(sql).run(...args)})})}} as unknown as Env;
 await incident(env,'site',true,3);await incident(env,'site',true,3);expect(send).not.toHaveBeenCalled();
 await incident(env,'site',true,3);await incident(env,'site',true,3);expect(send).toHaveBeenCalledTimes(1);
 await incident(env,'site',false,3);await incident(env,'site',false,3);expect(send).toHaveBeenCalledTimes(2);d.close();
});
