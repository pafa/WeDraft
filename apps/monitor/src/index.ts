import { collect, json } from './collect.js';
import { authorized } from './auth.js';
import { dashboard, dashboardScript } from './dashboard.js';
import { stats, maintain } from './stats.js';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/telemetry/events') return collect(request, env);
    if (url.pathname.startsWith('/api/telemetry/')) return json({error:'not_found'},404);
    if (url.pathname === '/monitor' || url.pathname.startsWith('/monitor/')) {
      if (!(await authorized(request,env))) return json({error:'access_required'},403);
      if (request.method !== 'GET') return json({error:'method'},405);
      if (url.pathname === '/monitor/app.js') return new Response(dashboardScript,{headers:{'Content-Type':'text/javascript;charset=utf-8','Cache-Control':'no-store'}});
      if (url.pathname === '/monitor/api') {
        try { return json(await stats(env,url)); } catch { return json({error:'storage_unavailable'},503); }
      }
      if (url.pathname !== '/monitor' && url.pathname !== '/monitor/') return json({error:'not_found'},404);
      return new Response(dashboard.replace("WEDRAFT / PRIVATE OBSERVABILITY",env.ENVIRONMENT==="local"?"WEDRAFT / LOCAL TEST DATA":"WEDRAFT / PRIVATE OBSERVABILITY"), {headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event,env) { await maintain(env); },
} satisfies ExportedHandler<Env>;
