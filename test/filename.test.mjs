import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFilename, sanitizeFilename, domainOf } from "../src/lib/filename.js";

const date = new Date(2026, 8, 18, 9, 5, 7); // 2026-09-18 09:05:07 local time

test("expands every token", () => {
  const name = buildFilename("{title}|{domain}|{date}|{time}|{year}-{month}-{day}|{hour}{minute}{second}|{n}", {
    title: "Hello", url: "https://www.example.com/a", date, counter: 42,
  });
  assert.equal(name, "Hello-example.com-2026-09-18-09-05-07-2026-09-18-090507-42");
});

test("uses the default template when none is given", () => {
  assert.equal(buildFilename("", { title: "Page", date }), "Page 2026-09-18 09-05-07");
});

test("falls back to the domain, then to 'capture', when the title is empty", () => {
  assert.equal(buildFilename("{title}", { url: "https://news.site.org/x", date }), "news.site.org");
  assert.equal(buildFilename("{title}", { date }), "capture");
});

test("leaves unknown tokens untouched and is case-insensitive", () => {
  assert.equal(buildFilename("{TITLE} {unknown}", { title: "T", date }), "T {unknown}");
});

test("sanitizes illegal characters and trims length", () => {
  assert.equal(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), "a-b-c-d-e-f-g-h-i-j");
  assert.equal(sanitizeFilename("  ..dots and spaces..  "), "dots and spaces");
  assert.equal(sanitizeFilename(""), "capture");
  assert.equal(sanitizeFilename("x".repeat(500)).length, 120);
});

test("domainOf strips www and tolerates bad input", () => {
  assert.equal(domainOf("https://www.example.com/path"), "example.com");
  assert.equal(domainOf("not a url"), "");
  assert.equal(domainOf(undefined), "");
});
