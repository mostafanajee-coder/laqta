import { initI18n, t } from "../lib/i18n.js";
import { getSettings, saveSettings, resetSettings, DEFAULT_SETTINGS } from "../lib/settings.js";
import { buildFilename } from "../lib/filename.js";

const form = document.getElementById("form");
const fields = {
  jpegQuality: document.getElementById("jpegQuality"),
  jpegQualityValue: document.getElementById("jpegQualityValue"),
  saveAsDialog: document.getElementById("saveAsDialog"),
  filenameTemplate: document.getElementById("filenameTemplate"),
  filenamePreview: document.getElementById("filenamePreview"),
  hideFixedElements: document.getElementById("hideFixedElements"),
  captureDelay: document.getElementById("captureDelay"),
  retentionDays: document.getElementById("retentionDays"),
  savedMessage: document.getElementById("savedMessage"),
  shortcuts: document.getElementById("shortcuts"),
};

let savedTimer = 0;

function fill(settings) {
  form.elements.format.value = settings.format;
  fields.jpegQuality.value = String(Math.round(settings.jpegQuality * 100));
  fields.saveAsDialog.checked = settings.saveAsDialog;
  fields.filenameTemplate.value = settings.filenameTemplate;
  fields.hideFixedElements.checked = settings.hideFixedElements;
  fields.captureDelay.value = String(settings.captureDelay);
  fields.retentionDays.value = String(settings.retentionDays);
  updateDerived();
}

function read() {
  return {
    format: form.elements.format.value,
    jpegQuality: Number(fields.jpegQuality.value) / 100,
    saveAsDialog: fields.saveAsDialog.checked,
    filenameTemplate: fields.filenameTemplate.value,
    hideFixedElements: fields.hideFixedElements.checked,
    captureDelay: Number(fields.captureDelay.value),
    retentionDays: Number(fields.retentionDays.value),
  };
}

function updateDerived() {
  fields.jpegQualityValue.textContent = `${fields.jpegQuality.value}%`;
  fields.filenamePreview.textContent = `${buildFilename(fields.filenameTemplate.value, {
    title: "Example page", url: "https://example.com/article", counter: 1,
  })}.png`;
}

function flashSaved() {
  fields.savedMessage.textContent = t("options_saved");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { fields.savedMessage.textContent = ""; }, 2500);
}

async function renderShortcuts() {
  fields.shortcuts.replaceChildren();
  let commands = [];
  try { commands = await chrome.commands.getAll(); } catch { return; }
  for (const command of commands) {
    if (command.name === "_execute_action") continue;
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = t(`cmd_${command.name.replace(/-/g, "_")}`);
    const key = document.createElement("kbd");
    key.textContent = command.shortcut || "—";
    item.append(label, key);
    fields.shortcuts.appendChild(item);
  }
}

async function main() {
  initI18n();
  fill(await getSettings());
  await renderShortcuts();

  fields.jpegQuality.addEventListener("input", updateDerived);
  fields.filenameTemplate.addEventListener("input", updateDerived);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings(read());
    fill(await getSettings());
    flashSaved();
  });

  document.getElementById("reset").addEventListener("click", async () => {
    await resetSettings();
    fill({ ...DEFAULT_SETTINGS });
    flashSaved();
  });

  document.getElementById("openShortcuts").addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
}

main().catch((error) => {
  console.error(error);
  fields.savedMessage.textContent = String(error);
});
