import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {build} from 'esbuild';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Opt-in extension of the immutable release directory. No deployment or account changes.
export async function prepareMonitorHosting(directory,site,configuration) {
  const c=JSON.parse(await readFile(configuration,'utf8'));
  if(c.workersPlan!=='free')throw Error('Only a verified Workers Free account is allowed.');
  if(!/^[0-9a-f]{32}$/.test(c.accountId)||!/^[0-9a-f-]{36}$/.test(c.databaseId))throw Error('Account and D1 IDs required.');
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(c.accessIssuer)||!/^[0-9a-f]{64}$/.test(c.accessAud))throw Error('Configured Access issuer and audience required.');
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(c.adminEmail))throw Error('Single admin email required.');
  if(c.emailVerified!==true && c.alertFrom)throw Error('Free alert recipient must be verified before enabling email.');
  if(c.alertFrom && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(c.alertFrom))throw Error('Invalid sender.');
  const config=JSON.parse(await readFile(join(directory,'wrangler.jsonc'),'utf8'));
  config.main='./monitor/index.js';config.compatibility_date='2026-09-27';config.compatibility_flags=['nodejs_compat'];config.account_id=c.accountId;
  config.assets.binding='ASSETS';config.assets.run_worker_first=['/api/telemetry/*','/monitor','/monitor/*'];
  config.d1_databases=[{binding:'DB',database_name:'wedraft-monitoring',database_id:c.databaseId,migrations_dir:'./monitor/migrations'}];
  config.ratelimits=[{name:'INGEST_LIMIT',namespace_id:'27092026',simple:{limit:30,period:60}}];
  config.send_email=[{name:'ALERT_EMAIL',destination_address:c.adminEmail}];
  config.vars={ENVIRONMENT:'production',COLLECT_ORIGIN:new URL(site).origin,ENABLED:'true',ACCESS_ISSUER:c.accessIssuer,ACCESS_AUD:c.accessAud,ADMIN_EMAILS:c.adminEmail,ALERT_FROM:c.alertFrom??'',ALERT_TO:c.emailVerified?c.adminEmail:''};
  config.triggers={crons:['*/5 * * * *']};
  await mkdir(join(directory,'monitor'));
  await build({entryPoints:[fileURLToPath(new URL('../apps/monitor/src/index.ts',import.meta.url))],outfile:join(directory,'monitor/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:*']});
  await cp(new URL('../apps/monitor/migrations',import.meta.url),join(directory,'monitor/migrations'),{recursive:true});
  await writeFile(join(directory,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');
}
