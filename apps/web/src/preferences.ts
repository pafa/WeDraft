import { DEFAULT_TEMPLATE_ID, listTemplates } from "@wedraft/core";

export const TEMPLATE_COOKIE = "wedraft_template";
const known = new Set(listTemplates().map((template) => template.id));

export function readDefaultTemplate(cookie: string): string {
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${TEMPLATE_COOKIE}=`))?.slice(TEMPLATE_COOKIE.length + 1);
  try { const id = decodeURIComponent(value ?? ""); return known.has(id) ? id : DEFAULT_TEMPLATE_ID; }
  catch { return DEFAULT_TEMPLATE_ID; }
}

export function templateCookie(id: string, secure: boolean): string {
  if (!known.has(id)) throw new Error("未知模板，无法设置为默认值。");
  return `${TEMPLATE_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
