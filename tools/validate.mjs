/**
 * Static checks for the unpacked extension. Exits non-zero on failure.
 *
 *   node tools/validate.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "test", "tools", ".github"]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return IGNORED_DIRECTORIES.has(entry.name) ? [] : walk(path.join(directory, entry.name));
    }
    return [path.join(directory, entry.name)];
  });
}

const relative = (file) => path.relative(root, file).replaceAll(path.sep, "/");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${relative(file)}: invalid JSON (${error.message})`);
    return null;
  }
}

function resolveFromRoot(reference) {
  return path.resolve(root, reference.split(/[?#]/, 1)[0].replace(/^\/+/, ""));
}

function resolveFromFile(file, reference) {
  const clean = reference.split(/[?#]/, 1)[0];
  return clean.startsWith("/") ? resolveFromRoot(clean) : path.resolve(path.dirname(file), clean);
}

// ---------------------------------------------------------------- manifest
const manifest = readJson(path.join(root, "manifest.json"));
if (!manifest) {
  report();
}

if (manifest.manifest_version !== 3) fail("manifest.json: manifest_version must be 3");
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? "")) fail("manifest.json: version must be 1-4 dot-separated integers");
if (!(manifest.content_security_policy?.extension_pages ?? "").includes("object-src 'none'")) {
  fail("manifest.json: extension_pages CSP must keep object-src 'none'");
}
if (manifest.host_permissions?.length) warn("manifest.json: host_permissions present; activeTab is preferred");
if (manifest.web_accessible_resources?.length) warn("manifest.json: web_accessible_resources present; keep it minimal");

const suggestedKeys = Object.values(manifest.commands ?? {}).filter((command) => command.suggested_key).length;
if (suggestedKeys > 4) fail("manifest.json: Chrome allows at most 4 commands with suggested keys");

const manifestFiles = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  manifest.options_ui?.page,
  manifest.options_page,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? []),
].filter(Boolean);
for (const file of manifestFiles) {
  if (!fs.existsSync(resolveFromRoot(file))) fail(`manifest.json: referenced file is missing: ${file}`);
}

// ------------------------------------------------------------------ locales
const localesDirectory = path.join(root, "_locales");
const locales = new Map();
for (const entry of fs.readdirSync(localesDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(localesDirectory, entry.name, "messages.json");
  const messages = readJson(file);
  if (!messages) continue;
  locales.set(entry.name, messages);
  for (const [key, value] of Object.entries(messages)) {
    if (!value || typeof value.message !== "string" || !value.message.trim()) {
      fail(`${relative(file)}: "${key}" must contain a non-empty message`);
      continue;
    }
    const used = [...value.message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((match) => match[1].toLowerCase());
    const declared = Object.keys(value.placeholders ?? {}).map((name) => name.toLowerCase());
    for (const name of used) {
      if (!declared.includes(name)) fail(`${relative(file)}: "${key}" uses undeclared placeholder $${name}$`);
    }
    for (const name of declared) {
      if (!used.includes(name)) warn(`${relative(file)}: "${key}" declares unused placeholder $${name}$`);
    }
  }
}

const defaultLocale = manifest.default_locale;
const defaultMessages = locales.get(defaultLocale);
if (!defaultMessages) fail(`manifest.json: default locale "${defaultLocale}" has no messages.json`);

for (const key of [...JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)].map((match) => match[1])) {
  if (defaultMessages && !defaultMessages[key]) fail(`manifest.json: message "${key}" is missing from the default locale`);
}

if (defaultMessages) {
  for (const [name, messages] of locales) {
    if (name === defaultLocale) continue;
    const missing = Object.keys(defaultMessages).filter((key) => !messages[key]);
    const extra = Object.keys(messages).filter((key) => !defaultMessages[key]);
    if (missing.length) fail(`_locales/${name}/messages.json: missing ${missing.length} key(s): ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}`);
    if (extra.length) warn(`_locales/${name}/messages.json: ${extra.length} key(s) not in the default locale: ${extra.slice(0, 8).join(", ")}`);
    for (const key of Object.keys(defaultMessages)) {
      if (!messages[key]) continue;
      const expected = Object.keys(defaultMessages[key].placeholders ?? {}).map((n) => n.toLowerCase()).sort().join(",");
      const actual = Object.keys(messages[key].placeholders ?? {}).map((n) => n.toLowerCase()).sort().join(",");
      if (expected !== actual) fail(`_locales/${name}/messages.json: "${key}" placeholders differ from the default locale`);
    }
  }
}

// -------------------------------------------------------------------- files
const files = walk(root);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const jsFiles = files.filter((file) => /\.(?:m?js)$/.test(file));

for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    fail(`${relative(file)}: syntax error\n${String(error.stderr ?? "").trim()}`);
  }
}

const referencedKeys = new Set();
for (const file of htmlFiles) {
  const name = relative(file);
  const source = fs.readFileSync(file, "utf8");
  const body = source.replace(/<!--[\s\S]*?-->/g, "");

  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(body)) fail(`${name}: inline <script> is blocked by the MV3 CSP`);
  if (/\son[a-z]+\s*=\s*["']/i.test(body)) fail(`${name}: inline event handler is blocked by the MV3 CSP`);
  if (/\bjavascript:/i.test(body)) fail(`${name}: javascript: URL is blocked by the MV3 CSP`);
  if (!/<html\b[^>]*\blang\s*=/i.test(source)) fail(`${name}: <html> is missing a lang attribute`);
  if (!/<meta\s+charset/i.test(source)) fail(`${name}: missing <meta charset>`);
  if (!/<title\b/i.test(source)) fail(`${name}: missing <title>`);
  if ((source.match(/<head\b/gi) ?? []).length !== (source.match(/<\/head>/gi) ?? []).length) fail(`${name}: unbalanced <head>`);
  if ((source.match(/<body\b/gi) ?? []).length !== (source.match(/<\/body>/gi) ?? []).length) fail(`${name}: unbalanced <body>`);

  const ids = new Map();
  for (const match of body.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) ids.set(match[1], (ids.get(match[1]) ?? 0) + 1);
  for (const [id, count] of ids) if (count > 1) fail(`${name}: duplicate id "${id}" (${count} occurrences)`);

  for (const match of body.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const reference = match[1].trim();
    if (!reference || reference.startsWith("#") || /^(?:https?:|mailto:|data:|chrome:|blob:)/i.test(reference)) continue;
    if (!fs.existsSync(resolveFromFile(file, reference))) fail(`${name}: local resource is missing: ${reference}`);
  }

  for (const match of body.matchAll(/<a\b[^>]*\btarget\s*=\s*["']_blank["'][^>]*>/gi)) {
    if (!/\brel\s*=\s*["'][^"']*noopener/i.test(match[0])) fail(`${name}: target="_blank" link is missing rel="noopener"`);
  }

  for (const match of body.matchAll(/\bdata-i18n(?:-[a-z-]+)?\s*=\s*["']([^"']+)["']/gi)) referencedKeys.add(match[1]);
  for (const match of body.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=/i.test(match[0])) fail(`${name}: <img> without alt attribute: ${match[0].slice(0, 60)}`);
  }
}

// Keys used from JS via t("...") are also checked against every catalog.
for (const file of jsFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z0-9_]+)["']/g)) referencedKeys.add(match[1]);
  for (const match of source.matchAll(/getMessage\(\s*["']([A-Za-z0-9_]+)["']/g)) referencedKeys.add(match[1]);
}
for (const [name, messages] of locales) {
  for (const key of referencedKeys) {
    if (!messages[key]) fail(`_locales/${name}/messages.json: missing key "${key}" referenced by HTML or JS`);
  }
}

report();

function report() {
  for (const message of warnings) console.warn(`WARN ${message}`);
  if (failures.length) {
    for (const message of failures) console.error(`FAIL ${message}`);
    console.error(`Validation failed with ${failures.length} error(s).`);
    process.exit(1);
  }
  console.log(`Validation passed: ${htmlFiles?.length ?? 0} HTML, ${jsFiles?.length ?? 0} JavaScript, ${locales.size} locale catalog(s).`);
  process.exit(0);
}
