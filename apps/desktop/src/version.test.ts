import { describe, expect, it } from "vitest";

import { APP_UPDATED_AT, APP_VERSION } from "./version.js";

describe("application version", () => {
  it("shows the stable version and update date", () => {
    expect(APP_VERSION).toBe("1.1.3");
    expect(APP_UPDATED_AT).toBe("2026.09.27");
  });
});
