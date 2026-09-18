/** Laqta service worker: entry points (popup, commands, context menus, selection messages). */

import { runCapture, captureSelection, isBusy, isCapturableUrl, UnsupportedPageError } from "./capture.js";
import { loadCatalog, resolveLanguage, formatMessage } from "../lib/i18n.js";

const MENU_IDS = {
  root: "laqta-root",
  full: "laqta-capture-full",
  visible: "laqta-capture-visible",
  selection: "laqta-capture-selection",
};

const COMMAND_TO_MODE = {
  "capture-full": "full",
  "capture-visible": "visible",
  "capture-selection": "selection",
};

chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildContextMenus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.language) rebuildContextMenus();
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  const mode = COMMAND_TO_MODE[command];
  if (!mode) return;
  const target = tab ?? await getActiveTab();
  if (target) startCapture(mode, target).catch(reportError);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  const mode = { [MENU_IDS.full]: "full", [MENU_IDS.visible]: "visible", [MENU_IDS.selection]: "selection" }[info.menuItemId];
  if (mode) startCapture(mode, tab).catch(reportError);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "capture") {
    (async () => {
      const tab = await getActiveTab();
      if (!tab) throw new Error("no active tab");
      if (!isCapturableUrl(tab.url ?? tab.pendingUrl)) throw new UnsupportedPageError();
      if (isBusy()) throw new Error("busy");
      // Reply first so the popup can close before the tab is captured.
      sendResponse({ ok: true });
      await sleep(120);
      await startCapture(message.mode, tab);
    })().catch((error) => {
      reportError(error);
      try { sendResponse({ ok: false, error: describeError(error) }); } catch { /* already answered */ }
    });
    return true;
  }

  if (message.type === "selection-made" && sender.tab) {
    captureSelection(sender.tab, message)
      .then((id) => openViewer(id, sender.tab))
      .catch(reportError);
    return false;
  }

  if (message.type === "selection-cancelled") {
    return false;
  }

  if (message.type === "get-state") {
    sendResponse({ busy: isBusy() });
    return false;
  }

  return false;
});

async function startCapture(mode, tab) {
  if (mode === "selection") {
    if (!isCapturableUrl(tab.url ?? tab.pendingUrl)) throw new UnsupportedPageError();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content/selection.js"] });
    return;
  }
  await setBadge(tab.id, "…");
  try {
    const id = await runCapture(mode, tab, (percent) => setBadge(tab.id, `${percent}%`));
    await openViewer(id, tab);
  } finally {
    await setBadge(tab.id, "");
  }
}

async function openViewer(captureId, sourceTab) {
  const url = chrome.runtime.getURL(`src/viewer/viewer.html?id=${encodeURIComponent(captureId)}`);
  await chrome.tabs.create({ url, index: sourceTab ? sourceTab.index + 1 : undefined, openerTabId: sourceTab?.id });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function setBadge(tabId, text) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#0ea5e9" });
    await chrome.action.setBadgeText({ tabId, text });
  } catch { /* the tab may be gone */ }
}

async function rebuildContextMenus() {
  const language = await resolveLanguage();
  const catalog = await loadCatalog(language);
  const t = (key) => formatMessage(catalog[key]) || key;
  const contexts = ["page", "frame", "selection", "image", "link"];

  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
  chrome.contextMenus.create({ id: MENU_IDS.root, title: t("menu_root"), contexts });
  chrome.contextMenus.create({ id: MENU_IDS.full, parentId: MENU_IDS.root, title: t("cmd_capture_full"), contexts });
  chrome.contextMenus.create({ id: MENU_IDS.visible, parentId: MENU_IDS.root, title: t("cmd_capture_visible"), contexts });
  chrome.contextMenus.create({ id: MENU_IDS.selection, parentId: MENU_IDS.root, title: t("cmd_capture_selection"), contexts });
}

function describeError(error) {
  if (error instanceof UnsupportedPageError) return "unsupported";
  if (error?.message === "busy") return "busy";
  return error?.message || String(error);
}

function reportError(error) {
  if (error instanceof UnsupportedPageError || error?.message === "busy") return;
  console.error("Laqta:", error);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
