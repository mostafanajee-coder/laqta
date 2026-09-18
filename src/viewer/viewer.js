import { initI18n, t } from "../lib/i18n.js";
import { getCapture } from "../lib/db.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { buildFilename } from "../lib/filename.js";
import { createPdfFromJpeg } from "../lib/pdf.js";
import { toJpeg } from "../lib/image.js";

const elements = {
  title: document.getElementById("pageTitle"),
  dimensions: document.getElementById("dimensions"),
  source: document.getElementById("sourceLink"),
  actions: document.getElementById("actions"),
  notice: document.getElementById("notice"),
  image: document.getElementById("image"),
  missing: document.getElementById("missing"),
  toast: document.getElementById("toast"),
};

let capture = null;
let toastTimer = 0;

function toast(text, isError = false) {
  elements.toast.textContent = text;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

async function nextFilename(extension) {
  const settings = await getSettings();
  const name = buildFilename(settings.filenameTemplate, {
    title: capture.title, url: capture.url, date: new Date(capture.createdAt), counter: settings.counter,
  });
  await saveSettings({ counter: settings.counter + 1 });
  return { filename: `${name}.${extension}`, saveAs: settings.saveAsDialog, settings };
}

async function download(blob, extension) {
  const { filename, saveAs } = await nextFilename(extension);
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs, conflictAction: "uniquify" });
    toast(t("viewer_saved", [filename]));
  } catch (error) {
    toast(t("viewer_error_save", [error.message]), true);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function savePng() {
  await download(capture.blob, "png");
}

async function saveJpg() {
  const { jpegQuality } = await getSettings();
  await download(await toJpeg(capture.blob, jpegQuality), "jpg");
}

async function savePdf() {
  const { jpegQuality } = await getSettings();
  const jpeg = await toJpeg(capture.blob, jpegQuality);
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const pdf = createPdfFromJpeg(bytes, capture.width, capture.height);
  await download(new Blob([pdf], { type: "application/pdf" }), "pdf");
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": capture.blob })]);
    toast(t("viewer_copied"));
  } catch (error) {
    console.error(error);
    toast(t("viewer_error_copy"), true);
  }
}

function bindActions() {
  const bind = (id, handler) => document.getElementById(id).addEventListener("click", () => {
    handler().catch((error) => toast(t("viewer_error_save", [error.message]), true));
  });
  bind("savePng", savePng);
  bind("saveJpg", saveJpg);
  bind("savePdf", savePdf);
  bind("copy", copyToClipboard);
  document.getElementById("print").addEventListener("click", () => window.print());
}

function render() {
  elements.title.removeAttribute("data-i18n");
  elements.title.textContent = capture.title || capture.url || t("viewer_title");
  document.title = `${elements.title.textContent} - ${t("viewer_title")}`;
  elements.dimensions.textContent = t("viewer_dimensions", [String(capture.width), String(capture.height)]);
  if (capture.url && /^https?:/i.test(capture.url)) {
    elements.source.href = capture.url;
    elements.source.hidden = false;
  }
  if (capture.trimmed) {
    elements.notice.textContent = t("viewer_trimmed", [String(capture.height)]);
    elements.notice.hidden = false;
  }
  elements.image.src = URL.createObjectURL(capture.blob);
  elements.image.alt = capture.title || "";
  elements.image.hidden = false;
  elements.actions.hidden = false;
}

async function main() {
  await initI18n();
  const id = new URLSearchParams(location.search).get("id");
  capture = id ? await getCapture(id) : null;
  if (!capture) {
    elements.title.textContent = t("viewer_title");
    elements.missing.hidden = false;
    return;
  }
  render();
  bindActions();
}

main().catch((error) => {
  console.error(error);
  elements.title.textContent = String(error);
});
