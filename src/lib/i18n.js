/**
 * Runtime localization.
 *
 * chrome.i18n always follows the browser UI language. Laqta lets the user pick
 * the interface language in Options, so pages load the chosen catalog from
 * _locales/<lang>/messages.json at runtime and fall back to English for any
 * key the chosen catalog does not define.
 *
 * The pure helpers (pickLanguage, formatMessage) have no browser dependencies
 * so they can be unit-tested in Node.
 */

export const SUPPORTED_LANGUAGES = ["en", "ar"];
export const DEFAULT_LANGUAGE = "en";
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

/**
 * Resolve the language to display.
 * @param {string} preference  "auto" or a language code chosen by the user
 * @param {string} uiLanguage  the browser UI language, e.g. "ar-EG"
 * @param {string[]} supported
 */
export function pickLanguage(preference, uiLanguage, supported = SUPPORTED_LANGUAGES) {
  if (preference && preference !== "auto" && supported.includes(preference)) {
    return preference;
  }
  const normalized = String(uiLanguage || "").toLowerCase().replace("-", "_");
  if (supported.includes(normalized)) return normalized;
  const base = normalized.split("_")[0];
  if (supported.includes(base)) return base;
  return DEFAULT_LANGUAGE;
}

export function isRtl(language) {
  return RTL_LANGUAGES.has(String(language).split(/[-_]/)[0]);
}

/**
 * Expand a messages.json entry the same way chrome.i18n.getMessage does:
 * "$NAME$" placeholders map to "$1"-style substitutions.
 * @param {{message: string, placeholders?: Record<string, {content: string}>}} entry
 * @param {string[]|string} substitutions
 */
export function formatMessage(entry, substitutions = []) {
  if (!entry || typeof entry.message !== "string") return "";
  const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
  const placeholders = entry.placeholders || {};
  const lookup = new Map(Object.entries(placeholders).map(([name, value]) => [name.toLowerCase(), value.content ?? ""]));

  const expandContent = (content) => content.replace(/\$(\d+)/g, (_, index) => String(subs[Number(index) - 1] ?? ""));

  return entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (whole, name) => {
    const content = lookup.get(name.toLowerCase());
    if (content === undefined) return whole;
    return expandContent(content);
  }).replace(/\$\$/g, "$");
}

let currentLanguage = DEFAULT_LANGUAGE;
let catalog = {};
const changeListeners = new Set();

async function fetchCatalog(language) {
  const url = chrome.runtime.getURL(`_locales/${language}/messages.json`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load locale "${language}" (${response.status})`);
  return response.json();
}

/**
 * Load the catalog for a language (merged over English). Works in pages and
 * in the service worker.
 */
export async function loadCatalog(language) {
  const base = await fetchCatalog(DEFAULT_LANGUAGE);
  if (language === DEFAULT_LANGUAGE) return base;
  try {
    return { ...base, ...(await fetchCatalog(language)) };
  } catch (error) {
    console.warn(error);
    return base;
  }
}

export async function getLanguagePreference() {
  const { language } = await chrome.storage.local.get({ language: "auto" });
  return language;
}

export async function resolveLanguage() {
  return pickLanguage(await getLanguagePreference(), chrome.i18n.getUILanguage());
}

/** Translate a key using the loaded catalog. Falls back to chrome.i18n, then the key. */
export function t(key, substitutions = []) {
  const entry = catalog[key];
  if (entry) return formatMessage(entry, substitutions);
  const fromBrowser = globalThis.chrome?.i18n?.getMessage?.(key, substitutions);
  return fromBrowser || key;
}

export function getCurrentLanguage() {
  return currentLanguage;
}

/** Apply translations to data-i18n* attributes below `root`. */
export function localizeDom(root = document) {
  const targets = [
    ["data-i18n", (element, text) => { element.textContent = text; }],
    ["data-i18n-title", (element, text) => { element.title = text; }],
    ["data-i18n-placeholder", (element, text) => { element.placeholder = text; }],
    ["data-i18n-aria-label", (element, text) => { element.setAttribute("aria-label", text); }],
  ];
  for (const [attribute, apply] of targets) {
    for (const element of root.querySelectorAll(`[${attribute}]`)) {
      apply(element, t(element.getAttribute(attribute)));
    }
  }
}

function applyDirection() {
  const html = document.documentElement;
  html.lang = currentLanguage;
  html.dir = isRtl(currentLanguage) ? "rtl" : "ltr";
}

/**
 * Initialize localization for an extension page: loads the chosen catalog,
 * translates the DOM, and keeps following changes made in Options.
 */
export async function initI18n() {
  currentLanguage = await resolveLanguage();
  catalog = await loadCatalog(currentLanguage);
  applyDirection();
  localizeDom();

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local" || !changes.language) return;
    currentLanguage = await resolveLanguage();
    catalog = await loadCatalog(currentLanguage);
    applyDirection();
    localizeDom();
    for (const listener of changeListeners) {
      try { listener(currentLanguage); } catch (error) { console.error(error); }
    }
  });

  return currentLanguage;
}

export function onLanguageChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}
