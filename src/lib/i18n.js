/**
 * Localization helpers built on chrome.i18n (catalog in _locales/en).
 */

/** Translate a message key. Falls back to the key when the message is missing. */
export function t(key, substitutions = []) {
  const message = globalThis.chrome?.i18n?.getMessage?.(key, substitutions);
  return message || key;
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

/** Localize an extension page. */
export function initI18n() {
  localizeDom();
}
