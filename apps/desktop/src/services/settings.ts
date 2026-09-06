import type { UserSettings } from "@wedraft/shared-types";
import { availableTemplates } from "@wedraft/wechat-renderer";

import { defaultSettings } from "../stores/editor-store.js";

export const TEMPLATE_DEFAULT_VERSION = 2;

export function normalizeSettings(
  storedSettings?: UserSettings,
): UserSettings {
  const shouldMigrateDefault =
    (storedSettings?.templateDefaultVersion ?? 0) <
    TEMPLATE_DEFAULT_VERSION;
  const requestedTemplateId = shouldMigrateDefault
    ? defaultSettings.defaultTemplateId
    : (storedSettings?.defaultTemplateId ??
      defaultSettings.defaultTemplateId);
  const safeTemplateId = availableTemplates.some(
    (template) => template.id === requestedTemplateId,
  )
    ? requestedTemplateId
    : defaultSettings.defaultTemplateId;

  return {
    ...defaultSettings,
    ...storedSettings,
    defaultTemplateId: safeTemplateId,
    templateDefaultVersion: TEMPLATE_DEFAULT_VERSION,
  };
}
