import {beforeEach,afterEach,it,expect,vi} from 'vitest';
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('window',{addEventListener:vi.fn()});vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.resetModules();});
it('sends nothing before consent, revocation discards queued metadata',async()=>{
 const {Telemetry}=await import('./telemetry.js');const send=vi.fn().mockResolvedValue(new Response('{}'));const t=new Telemetry(send);
 t.start('typing');t.emit('page_view',{route:'editor'});await t.flush();expect(send).not.toHaveBeenCalled();
 t.consent(true);t.start('paste_plain');t.once('content_input',{method:'paste_plain'});t.consent(false);await t.flush();expect(send).not.toHaveBeenCalled();
});
it('emits no sample article and separates idle sessions as partial tasks',async()=>{
 const {Telemetry}=await import('./telemetry.js');const send=vi.fn().mockResolvedValue(new Response('{}'));const t=new Telemetry(send);
 t.consent(true);t.emit('page_view',{route:'editor'});await t.flush();expect(JSON.parse(send.mock.calls[0]![1].body).events[0].article).toBeNull();
 t.start('paste_html');await t.flush();const first=JSON.parse(send.mock.calls[1]![1].body).events[0];expect(first.properties.partial).toBe(false);
 vi.setSystemTime(Date.now()+31*60_000);t.start('typing');await t.flush();const second=JSON.parse(send.mock.calls[2]![1].body).events[0];expect(second.session).not.toBe(first.session);expect(second.properties.partial).toBe(true);t.consent(false);
});
it('stops at a quota response and never blocks editing with a rejected promise',async()=>{
 const {Telemetry}=await import('./telemetry.js');const send=vi.fn().mockResolvedValue(new Response('{}',{status:429}));const t=new Telemetry(send);
 t.consent(true);t.start('typing');await t.flush();t.emit('page_view',{route:'ai'});await t.flush();expect(send).toHaveBeenCalledTimes(1);t.consent(false);
});
it('calls browser fetch without binding this to the Telemetry instance',async()=>{
 const contexts:unknown[]=[];const send=vi.fn(function(this:unknown){contexts.push(this);return Promise.resolve(new Response('{}'));});
 vi.stubGlobal('fetch',send);
 const {Telemetry}=await import('./telemetry.js');const t=new Telemetry();t.consent(true);t.emit('page_view',{route:'editor'});await t.flush();expect(send).toHaveBeenCalledTimes(1);expect(contexts[0]).not.toBe(t);t.consent(false);
});
