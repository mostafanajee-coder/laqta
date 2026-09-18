/** Capture orchestration: runs in the service worker. */

import { planCapture } from "../lib/tiles.js";
import { toBitmap, cropBitmap } from "../lib/image.js";
import { putCapture, pruneCaptures, newCaptureId } from "../lib/db.js";
import { getSettings } from "../lib/settings.js";
import {
  prepareForCapture, scrollToTile, restoreAfterCapture, readPageInfo, PAGE_SCRIPT_OPTIONS,
} from "./page-scripts.js";

// chrome.tabs.captureVisibleTab is limited to 2 calls per second.
const CAPTURE_INTERVAL_MS = 550;
const DAY_MS = 24 * 60 * 60 * 1000;

const BLOCKED_URL = /^(chrome|chrome-extension|edge|about|view-source|devtools|chrome-untrusted|brave|opera|vivaldi):/i;
const BLOCKED_HOSTS = /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons|addons\.mozilla\.org)/i;

export class UnsupportedPageError extends Error {
  constructor() {
    super("unsupported page");
    this.name = "UnsupportedPageError";
  }
}

export function isCapturableUrl(url) {
  if (!url) return false;
  return !BLOCKED_URL.test(url) && !BLOCKED_HOSTS.test(url);
}

let activeCapture = null;

export function isBusy() {
  return activeCapture !== null;
}

/**
 * Run a capture for a tab.
 * @param {"full"|"visible"} mode
 * @param {chrome.tabs.Tab} tab
 * @param {(percent: number) => void} onProgress
 * @returns {Promise<string>} capture id
 */
export async function runCapture(mode, tab, onProgress = () => {}) {
  if (activeCapture) throw new Error("busy");
  if (!isCapturableUrl(tab.url ?? tab.pendingUrl)) throw new UnsupportedPageError();

  activeCapture = { tabId: tab.id, mode };
  try {
    const settings = await getSettings();
    if (settings.captureDelay > 0) {
      onProgress(0);
      await sleep(settings.captureDelay * 1000);
    }
    const record = mode === "full"
      ? await captureFullPage(tab, settings, onProgress)
      : await captureVisible(tab, "visible");
    await storeCapture(record, settings);
    return record.id;
  } finally {
    activeCapture = null;
  }
}

/** Capture the visible viewport and crop it to a rectangle chosen by the user. */
export async function captureSelection(tab, selection) {
  if (activeCapture) throw new Error("busy");
  activeCapture = { tabId: tab.id, mode: "selection" };
  try {
    const settings = await getSettings();
    const dataUrl = await captureTab(tab.windowId);
    const bitmap = await toBitmap(dataUrl);
    try {
      const dpr = selection.devicePixelRatio || 1;
      const { blob, width, height } = await cropBitmap(bitmap, {
        x: selection.rect.x * dpr,
        y: selection.rect.y * dpr,
        width: selection.rect.width * dpr,
        height: selection.rect.height * dpr,
      });
      const record = makeRecord({ blob, width, height, title: selection.title, url: selection.url, mode: "selection" });
      await storeCapture(record, settings);
      return record.id;
    } finally {
      bitmap.close();
    }
  } finally {
    activeCapture = null;
  }
}

async function captureVisible(tab, mode) {
  const [{ result: info }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPageInfo });
  const dataUrl = await captureTab(tab.windowId);
  const bitmap = await toBitmap(dataUrl);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return makeRecord({ blob, width: bitmap.width, height: bitmap.height, title: info?.title ?? tab.title, url: info?.url ?? tab.url, mode });
  } finally {
    bitmap.close();
  }
}

async function captureFullPage(tab, settings, onProgress) {
  const target = { tabId: tab.id };
  const scriptOptions = { ...PAGE_SCRIPT_OPTIONS, hideFixed: settings.hideFixedElements };

  const [{ result: metrics }] = await chrome.scripting.executeScript({ target, func: prepareForCapture, args: [scriptOptions] });
  if (!metrics) throw new Error("could not measure the page");

  const plan = planCapture(metrics);
  const dpr = metrics.devicePixelRatio || 1;
  const canvas = new OffscreenCanvas(Math.round(plan.width * dpr), Math.round(plan.height * dpr));
  const context = canvas.getContext("2d");
  let lastCaptureAt = 0;

  try {
    for (let index = 0; index < plan.tiles.length; index += 1) {
      const tile = plan.tiles[index];
      const [{ result: actual }] = await chrome.scripting.executeScript({
        target, func: scrollToTile, args: [tile.x, tile.y, { ...scriptOptions, hideFixed: scriptOptions.hideFixed && index > 0 }],
      });

      const wait = CAPTURE_INTERVAL_MS - (Date.now() - lastCaptureAt);
      if (wait > 0) await sleep(wait);
      const dataUrl = await captureTab(tab.windowId);
      lastCaptureAt = Date.now();

      const bitmap = await toBitmap(dataUrl);
      try {
        const x = Math.round((actual?.x ?? tile.x) * dpr);
        const y = Math.round((actual?.y ?? tile.y) * dpr);
        context.drawImage(bitmap, x, y);
      } finally {
        bitmap.close();
      }
      onProgress(Math.round(((index + 1) / plan.tiles.length) * 100));
    }
  } finally {
    await chrome.scripting.executeScript({ target, func: restoreAfterCapture, args: [scriptOptions] }).catch(() => {});
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return makeRecord({
    blob, width: canvas.width, height: canvas.height, title: metrics.title, url: metrics.url, mode: "full", trimmed: plan.trimmed,
  });
}

function captureTab(windowId) {
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}

function makeRecord(fields) {
  return { id: newCaptureId(), createdAt: Date.now(), trimmed: false, ...fields };
}

async function storeCapture(record, settings) {
  await putCapture(record);
  if (settings.retentionDays > 0) {
    await pruneCaptures(settings.retentionDays * DAY_MS).catch((error) => console.warn("prune failed", error));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
