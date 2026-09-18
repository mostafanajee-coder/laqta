import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, DEFAULT_SETTINGS } from "../src/lib/settings.js";

test("returns defaults for an empty object", () => {
  assert.deepEqual(normalizeSettings({}), { ...DEFAULT_SETTINGS });
});

test("clamps and coerces values", () => {
  const result = normalizeSettings({
    format: "gif", jpegQuality: 5, captureDelay: -3, retentionDays: "90", counter: 0,
    saveAsDialog: "yes", hideFixedElements: false, filenameTemplate: "   ",
  });
  assert.equal(result.format, "png");
  assert.equal(result.jpegQuality, 1);
  assert.equal(result.captureDelay, 0);
  assert.equal(result.retentionDays, 90);
  assert.equal(result.counter, 1);
  assert.equal(result.saveAsDialog, false);
  assert.equal(result.hideFixedElements, false);
  assert.equal(result.filenameTemplate, DEFAULT_SETTINGS.filenameTemplate);
});

test("only returns the requested keys for partial updates", () => {
  assert.deepEqual(normalizeSettings({ counter: 7, format: "jpg" }, ["counter"]), { counter: 7 });
});
