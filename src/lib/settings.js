/** User settings stored in chrome.storage.local. */

export const DEFAULT_SETTINGS = Object.freeze({
  format: "png",              // "png" | "jpg"
  jpegQuality: 0.92,          // 0.5 .. 1
  saveAsDialog: false,        // ask where to save every file
  filenameTemplate: "{title} {date} {time}",
  hideFixedElements: true,    // hide position: fixed/sticky after the first tile
  captureDelay: 0,            // seconds
  retentionDays: 30,          // 0 = keep forever
  counter: 1,                 // value of the {n} token
});

export async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return normalizeSettings(stored);
}

export async function saveSettings(patch) {
  await chrome.storage.local.set(normalizeSettings({ ...DEFAULT_SETTINGS, ...patch }, Object.keys(patch)));
}

export async function resetSettings() {
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS });
}

/**
 * Coerce a settings object to valid values. When `keys` is given only those
 * keys are returned (used for partial updates).
 */
export function normalizeSettings(input, keys = Object.keys(DEFAULT_SETTINGS)) {
  const result = {};
  for (const key of keys) {
    const fallback = DEFAULT_SETTINGS[key];
    const value = input[key];
    switch (key) {
      case "format":
        result[key] = value === "jpg" ? "jpg" : "png";
        break;
      case "jpegQuality":
        result[key] = clamp(Number(value), 0.5, 1, fallback);
        break;
      case "captureDelay":
        result[key] = clamp(Math.round(Number(value)), 0, 60, fallback);
        break;
      case "retentionDays":
        result[key] = clamp(Math.round(Number(value)), 0, 3650, fallback);
        break;
      case "counter":
        result[key] = clamp(Math.round(Number(value)), 1, Number.MAX_SAFE_INTEGER, fallback);
        break;
      case "saveAsDialog":
      case "hideFixedElements":
        result[key] = typeof value === "boolean" ? value : fallback;
        break;
      case "filenameTemplate":
        result[key] = typeof value === "string" && value.trim() ? value.trim() : fallback;
        break;
      default:
        result[key] = value === undefined ? fallback : value;
    }
  }
  return result;
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
