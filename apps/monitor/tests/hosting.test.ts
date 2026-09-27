import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
// @ts-expect-error Release helper is intentionally an executable ES module.
import {prepareMonitorHosting} from '../../../scripts/prepare-monitor-hosting.mjs';
it('produces a private production configuration and refuses paid or incomplete setup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wedraft-monitor-hosting-'));
 try {
  const path=join(dir,'setup.json'),config={workersPlan:'free',accountId:'a'.repeat(32),databaseId:crypto.randomUUID(),accessIssuer:'https://test.cloudflareaccess.com',accessAud:'b'.repeat(64),adminEmail:'owner@example.com',emailVerified:false};
  await writeFile(join(dir,'wrangler.jsonc'),JSON.stringify({name:'wedraft',workers_dev:false,preview_urls:false,assets:{directory:'./deploy-site'},observability:{enabled:false}}));
  await writeFile(path,JSON.stringify({...config,workersPlan:'paid'}));await expect(prepareMonitorHosting(dir,'https://wedraft.example.com',path)).rejects.toThrow('Free');
  await writeFile(path,JSON.stringify({...config,accessAud:''}));await expect(prepareMonitorHosting(dir,'https://wedraft.example.com',path)).rejects.toThrow('Access');
  await writeFile(path,JSON.stringify(config));await prepareMonitorHosting(dir,'https://wedraft.example.com',path);
  const generated=JSON.parse(await readFile(join(dir,'wrangler.jsonc'),'utf8'));
  expect(generated.vars.ENVIRONMENT).toBe('production');expect(generated.workers_dev).toBe(false);expect(generated.preview_urls).toBe(false);
  expect(generated.assets.run_worker_first).toEqual(['/api/telemetry/*','/monitor','/monitor/*']);expect(generated.send_email[0].destination_address).toBe('owner@example.com');
  expect((await readFile(join(dir,'monitor/index.js'),'utf8')).length).toBeGreaterThan(1000);
 }finally{await rm(dir,{recursive:true,force:true});}
});
