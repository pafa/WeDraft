import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE_ID, listTemplates } from "@wedraft/core";
import { readDefaultTemplate, templateCookie } from "../src/preferences.js";

describe("default template preference", () => {
  it.each(listTemplates().map(({ id }) => id))("restores the selected %s template", (id) => {
    expect(readDefaultTemplate(`session=other; ${templateCookie(id, false)}; unrelated=1`)).toBe(id);
  });

  it.each(["", "wedraft_template=removed-template", "wedraft_template=%E0%A4%A", "other_wedraft_template=blueprint", "wedraft_template_extra=blueprint"])("uses the built-in default for an absent or unusable preference: %s", (cookie) => {
    expect(readDefaultTemplate(cookie)).toBe(DEFAULT_TEMPLATE_ID);
  });

  it("decodes cookie values and ignores unrelated cookies", () => {
    expect(readDefaultTemplate("language=zh; wedraft_template=jade%2Dnotes; mode=light")).toBe("jade-notes");
  });

  it("remembers the preference for one year across routes with secure transport when available", () => {
    expect(templateCookie("blueprint", true)).toBe("wedraft_template=blueprint; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    expect(templateCookie("blueprint", false)).not.toContain("Secure");
  });

  it("rejects unknown IDs instead of writing a broken default or injected cookie attributes", () => {
    expect(() => templateCookie("missing", false)).toThrow("未知模板");
    expect(() => templateCookie("blueprint; Path=/elsewhere", false)).toThrow("未知模板");
  });
});
