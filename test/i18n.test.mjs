import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLanguage, formatMessage, isRtl } from "../src/lib/i18n.js";

test("pickLanguage honours an explicit supported preference", () => {
  assert.equal(pickLanguage("ar", "en-US"), "ar");
  assert.equal(pickLanguage("en", "ar"), "en");
});

test("pickLanguage falls back to the browser language, then English", () => {
  assert.equal(pickLanguage("auto", "ar-EG"), "ar");
  assert.equal(pickLanguage("auto", "en-GB"), "en");
  assert.equal(pickLanguage("auto", "de"), "en");
  assert.equal(pickLanguage("xx", "fr"), "en");
  assert.equal(pickLanguage(undefined, undefined), "en");
});

test("formatMessage expands named placeholders like chrome.i18n", () => {
  const entry = {
    message: "$WIDTH$ × $HEIGHT$ px",
    placeholders: { width: { content: "$1" }, height: { content: "$2" } },
  };
  assert.equal(formatMessage(entry, ["800", "600"]), "800 × 600 px");
  assert.equal(formatMessage(entry, "800"), "800 ×  px");
  assert.equal(formatMessage({ message: "plain" }), "plain");
  assert.equal(formatMessage({ message: "keep $UNKNOWN$" }), "keep $UNKNOWN$");
  assert.equal(formatMessage(null), "");
});

test("isRtl recognises right-to-left languages", () => {
  assert.equal(isRtl("ar"), true);
  assert.equal(isRtl("ar-SA"), true);
  assert.equal(isRtl("en"), false);
});
