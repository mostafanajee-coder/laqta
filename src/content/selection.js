/**
 * Area selection overlay. Injected into the active tab on demand.
 * Reports the chosen rectangle (viewport CSS pixels) to the service worker.
 */
(() => {
  if (window.__laqtaSelectionActive) return;
  window.__laqtaSelectionActive = true;

  const hintText = chrome.i18n.getMessage("selection_hint") || "Drag to select an area. Press Esc to cancel.";

  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", hintText);
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "2147483647", cursor: "crosshair",
    background: "rgba(15, 23, 42, 0.25)", userSelect: "none", touchAction: "none",
  });

  const hint = document.createElement("div");
  hint.textContent = hintText;
  Object.assign(hint.style, {
    position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
    padding: "8px 14px", borderRadius: "999px", background: "#0f172a", color: "#fff",
    font: "13px system-ui, sans-serif", pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,.3)",
  });

  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "fixed", display: "none", border: "2px solid #38bdf8",
    background: "rgba(56, 189, 248, 0.12)", boxSizing: "border-box", pointerEvents: "none",
  });

  const size = document.createElement("div");
  Object.assign(size.style, {
    position: "fixed", display: "none", padding: "2px 6px", borderRadius: "4px",
    background: "#0f172a", color: "#fff", font: "12px system-ui, sans-serif", pointerEvents: "none",
  });

  overlay.append(hint, box, size);
  document.documentElement.appendChild(overlay);

  let start = null;
  let rect = null;

  const rectFrom = (a, b) => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y),
  });

  const draw = () => {
    if (!rect) return;
    box.style.display = "block";
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    size.style.display = "block";
    size.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    size.style.left = `${Math.min(rect.x + rect.width + 8, window.innerWidth - 90)}px`;
    size.style.top = `${Math.min(rect.y + rect.height + 8, window.innerHeight - 24)}px`;
  };

  const cleanup = () => {
    overlay.remove();
    window.removeEventListener("keydown", onKey, true);
    window.__laqtaSelectionActive = false;
  };

  const finish = (message) => {
    cleanup();
    // Wait two frames so the overlay is gone before the tab is captured.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chrome.runtime.sendMessage(message).catch(() => {});
    }));
  };

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish({ type: "selection-cancelled" });
    }
  };

  overlay.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    rect = rectFrom(start, start);
    overlay.setPointerCapture(event.pointerId);
    hint.style.display = "none";
    draw();
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!start) return;
    rect = rectFrom(start, { x: event.clientX, y: event.clientY });
    draw();
  });

  overlay.addEventListener("pointerup", (event) => {
    if (!start) return;
    rect = rectFrom(start, { x: event.clientX, y: event.clientY });
    start = null;
    if (rect.width < 4 || rect.height < 4) {
      rect = null;
      box.style.display = "none";
      size.style.display = "none";
      hint.style.display = "block";
      return;
    }
    finish({
      type: "selection-made",
      rect,
      devicePixelRatio: window.devicePixelRatio || 1,
      title: document.title,
      url: location.href,
    });
  });

  window.addEventListener("keydown", onKey, true);
})();
