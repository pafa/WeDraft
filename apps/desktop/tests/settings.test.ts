import { describe, expect, it } from "vitest";

import type { UserSettings } from "@wedraft/shared-types";

import {
  normalizeSettings,
  TEMPLATE_DEFAULT_VERSION,
} from "../src/services/settings.js";

const oldSettings: UserSettings = {
  defaultAuthor: "",
  defaultTemplateId: "default-business",
  autosaveIntervalSeconds: 15,
};

describe("settings migration", () => {
  it("新安装默认使用小哈公社New", () => {
    expect(normalizeSettings()).toMatchObject({
      defaultTemplateId: "next-edition",
      templateDefaultVersion: TEMPLATE_DEFAULT_VERSION,
    });
  });

  it("旧版本设置只迁移一次到新默认模板", () => {
    expect(normalizeSettings(oldSettings).defaultTemplateId).toBe(
      "next-edition",
    );
    expect(
      normalizeSettings({
        ...oldSettings,
        templateDefaultVersion: TEMPLATE_DEFAULT_VERSION,
      }).defaultTemplateId,
    ).toBe("default-business");
  });
});
