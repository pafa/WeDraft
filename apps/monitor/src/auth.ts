import { createRemoteJWKSet, jwtVerify } from "jose";

export async function authorized(request: Request, env: Env): Promise<boolean> {
  const url = new URL(request.url);
  if (env.ENVIRONMENT === "local" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return true;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER) || !env.ACCESS_AUD || !env.ADMIN_EMAILS) return false;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 8192) return false;
  try {
    const keys = createRemoteJWKSet(new URL(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token,keys,{ issuer:env.ACCESS_ISSUER,audience:env.ACCESS_AUD,algorithms:["RS256"],requiredClaims:["exp","sub","email"] });
    return typeof payload.email === "string" && env.ADMIN_EMAILS.split(",").map(s=>s.trim().toLowerCase()).includes(payload.email.toLowerCase());
  } catch { return false; }
}
