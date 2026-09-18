import { initI18n, t, localizeDom } from "../lib/i18n.js";
import { listCaptures, deleteCapture, clearCaptures } from "../lib/db.js";
import { getSettings } from "../lib/settings.js";
import { domainOf } from "../lib/filename.js";

const list = document.getElementById("list");
const empty = document.getElementById("empty");
const count = document.getElementById("count");
const retention = document.getElementById("retention");
const clearAll = document.getElementById("clearAll");
const template = document.getElementById("itemTemplate");

const objectUrls = new Set();

function viewerUrl(id) {
  return `../viewer/viewer.html?id=${encodeURIComponent(id)}`;
}

function formatDate(timestamp) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

async function render() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
  list.replaceChildren();

  const [captures, settings] = await Promise.all([listCaptures(), getSettings()]);

  count.textContent = t("history_count", [String(captures.length)]);
  retention.textContent = settings.retentionDays > 0
    ? t("history_retention_note", [String(settings.retentionDays)])
    : t("history_retention_forever");
  empty.hidden = captures.length > 0;
  clearAll.hidden = captures.length === 0;

  for (const capture of captures) {
    const node = template.content.firstElementChild.cloneNode(true);
    const url = URL.createObjectURL(capture.blob);
    objectUrls.add(url);

    const thumb = node.querySelector(".thumb");
    thumb.href = viewerUrl(capture.id);
    thumb.querySelector("img").src = url;
    thumb.querySelector("img").alt = capture.title || "";

    node.querySelector(".card-title").textContent = capture.title || domainOf(capture.url) || t("viewer_title");
    node.querySelector(".card-meta").textContent =
      `${formatDate(capture.createdAt)} · ${t("viewer_dimensions", [String(capture.width), String(capture.height)])}`;
    node.querySelector(".open").href = viewerUrl(capture.id);
    node.querySelector(".delete").addEventListener("click", async () => {
      await deleteCapture(capture.id);
      await render();
    });

    localizeDom(node);
    list.appendChild(node);
  }
}

async function main() {
  initI18n();
  clearAll.addEventListener("click", async () => {
    if (!confirm(t("history_confirm_clear"))) return;
    await clearCaptures();
    await render();
  });
  await render();
}

main().catch((error) => {
  console.error(error);
  empty.textContent = String(error);
  empty.hidden = false;
});
