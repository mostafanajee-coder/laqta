import { initI18n, t } from "../lib/i18n.js";

const status = document.getElementById("status");
const buttons = [...document.querySelectorAll(".card-button")];

function showStatus(text, isError = false) {
  status.textContent = text;
  status.hidden = false;
  status.classList.toggle("error", isError);
}

function setBusy(busy) {
  for (const button of buttons) button.disabled = busy;
}

async function fillShortcuts() {
  try {
    const commands = await chrome.commands.getAll();
    for (const command of commands) {
      const target = document.querySelector(`[data-shortcut="${command.name}"]`);
      if (target && command.shortcut) target.textContent = command.shortcut;
    }
  } catch { /* commands API unavailable */ }
}

async function requestCapture(mode) {
  setBusy(true);
  showStatus(t("popup_capturing"));
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "capture", mode });
  } catch (error) {
    response = { ok: false, error: error.message };
  }
  if (response?.ok) {
    window.close();
    return;
  }
  setBusy(false);
  const reason = response?.error;
  if (reason === "unsupported") showStatus(t("popup_error_unsupported"), true);
  else if (reason === "busy") showStatus(t("popup_busy"), true);
  else showStatus(t("popup_error_generic", [reason || t("error_capture_failed")]), true);
}

async function main() {
  await initI18n();
  await fillShortcuts();

  for (const button of buttons) {
    button.addEventListener("click", () => requestCapture(button.dataset.mode));
  }

  document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  try {
    const state = await chrome.runtime.sendMessage({ type: "get-state" });
    if (state?.busy) {
      setBusy(true);
      showStatus(t("popup_busy"));
    }
  } catch { /* service worker starting */ }
}

main().catch((error) => showStatus(String(error), true));
