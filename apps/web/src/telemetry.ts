import { eventSchema, MAX_BATCH, QUEUE_TTL, SESSION_IDLE, type EventName, type EventProperties, type InputMethod, type TelemetryEvent } from '@wedraft/telemetry';
import { ENGINE_VERSION } from '@wedraft/core';
const KEY='wedraft.optional-statistics.v1';
export function readConsent():string|null {try{return localStorage.getItem(KEY);}catch{return null;}}
export class Telemetry {
  enabled=false;
  private session=crypto.randomUUID();
  private article:string|null=null;
  private seq=0;
  private last=0;
  private queue:{event:TelemetryEvent;at:number;tries:number}[]=[];
  private timer:ReturnType<typeof setTimeout>|undefined;
  private request:AbortController|undefined;
  private seen=new Set<string>();
  private suspended=false;
  private generation=0;
  private partial=false;
  constructor(private send:typeof fetch=(...args)=>fetch(...args)) {this.enabled=readConsent()==='yes';}
  consent(value:boolean, hasContent=false) {
    try{localStorage.setItem(KEY,value?'yes':'no');}catch{/* Preference remains in memory. */}
    this.reset(); this.enabled=value; this.partial=hasContent;
  }
  private reset() {
    clearTimeout(this.timer);this.timer=undefined;this.request?.abort();this.request=undefined;
    this.queue=[];this.session=crypto.randomUUID();this.article=null;this.seq=0;this.last=0;this.seen.clear();this.suspended=false;this.generation++;
  }
  newArticle() {this.article=null;this.seen.clear();this.partial=false;}
  private touch() {
    const now=Date.now();
    if(this.last&&now-this.last>SESSION_IDLE){this.reset();this.partial=true;}
    this.last=now;
  }
  start(method:InputMethod) {
    if(!this.enabled||this.suspended)return;
    this.touch();
    if(!this.article){this.article=crypto.randomUUID();this.emit('article_started',{method,partial:this.partial});this.partial=false;}
  }
  hasArticle(){return this.enabled&&this.article!==null;}
  once<N extends EventName>(name:N,properties:EventProperties<N>,key:string=name) {
    if(!this.enabled||this.suspended)return;this.touch();
    if(this.seen.has(key))return;this.seen.add(key);this.emit(name,properties);
  }
  emit<N extends EventName>(name:N,properties:EventProperties<N>) {
    if(!this.enabled||this.suspended)return;this.touch();
    if(!this.article&&["content_input","format_action","manual_edit","preview_ready","validation_changed","copy_requested","copy_result","export_result","article_checkpoint"].includes(name))this.start("unknown");
    if(this.seq>=2000||this.queue.length>=100)return;
    const parsed=eventSchema.safeParse({schema:1,id:crypto.randomUUID(),session:this.session,article:this.article,seq:this.seq+1,version:ENGINE_VERSION,name,properties});
    if(!parsed.success)return;
    this.seq++;this.queue.push({event:parsed.data,at:Date.now(),tries:0});
    this.schedule();
  }
  private schedule(){if(!this.timer&&!this.request)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},5000);}
  async flush() {
    if(!this.enabled||this.request||this.suspended)return;
    this.queue=this.queue.filter(e=>Date.now()-e.at<QUEUE_TTL&&e.tries<3);
    const batch=this.queue.slice(0,MAX_BATCH);if(!batch.length)return;
    const generation=this.generation,controller=new AbortController();this.request=controller;
    batch.forEach(e=>e.tries++);
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const r=await this.send('/api/telemetry/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:batch.map(e=>e.event)}),signal:controller.signal,keepalive:true});
      if(generation!==this.generation)return;
      if(r.ok || [400,403,413].includes(r.status))this.queue=this.queue.filter(e=>!batch.includes(e));
      else if(r.status===429||r.status===503){this.queue=[];this.suspended=true;}
    }catch{/* Bounded retry; telemetry never changes editing behavior. */}
    finally{clearTimeout(timeout);if(generation===this.generation){this.request=undefined;this.scheduleIfNeeded();}}
  }
  private scheduleIfNeeded(){if(this.queue.length&&!this.suspended)this.schedule();}
}
export const telemetry=new Telemetry();
// Flush only metadata on page departure. No event-level persistent storage.
window.addEventListener('pagehide',()=>{void telemetry.flush();});
