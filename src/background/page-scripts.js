/**
 * Functions injected into the captured page with chrome.scripting.executeScript.
 * Each function must be self-contained: it is serialized and runs in the page,
 * so it cannot reference anything else in this module.
 */

const STATE_KEY = "__laqtaCaptureState";

/** Measure the page and prepare it for a full-page capture. */
export function prepareForCapture(options) {
  const doc = document.documentElement;
  const body = document.body;
  const state = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scrollBehavior: doc.style.scrollBehavior,
    hidden: [],
  };

  const style = document.createElement("style");
  style.id = "__laqta-capture-style";
  style.textContent = "html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}html,body{scrollbar-width:none!important}";
  doc.appendChild(style);
  doc.style.scrollBehavior = "auto";

  window[options.stateKey] = state;

  return {
    pageWidth: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0),
    pageHeight: Math.max(doc.scrollHeight, body ? body.scrollHeight : 0),
    viewportWidth: doc.clientWidth || window.innerWidth,
    viewportHeight: doc.clientHeight || window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    title: document.title,
    url: location.href,
  };
}

/** Scroll to a tile and report where the page actually ended up. */
export function scrollToTile(x, y, options) {
  return new Promise((resolve) => {
    window.scrollTo(x, y);
    if (options.hideFixed) {
      const state = window[options.stateKey];
      if (state && state.hidden.length === 0) {
        for (const element of document.querySelectorAll("body *")) {
          const position = getComputedStyle(element).position;
          if (position === "fixed" || position === "sticky") {
            state.hidden.push([element, element.style.visibility]);
            element.style.visibility = "hidden";
          }
        }
      }
    }
    let frames = 2;
    const tick = () => {
      if (frames-- > 0) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => resolve({ x: window.scrollX, y: window.scrollY }), options.settleMs);
      }
    };
    requestAnimationFrame(tick);
  });
}

/** Undo everything prepareForCapture and scrollToTile changed. */
export function restoreAfterCapture(options) {
  const state = window[options.stateKey];
  document.getElementById("__laqta-capture-style")?.remove();
  if (!state) return;
  for (const [element, visibility] of state.hidden) element.style.visibility = visibility;
  document.documentElement.style.scrollBehavior = state.scrollBehavior;
  window.scrollTo(state.scrollX, state.scrollY);
  delete window[options.stateKey];
}

/** Basic page info for single-shot captures. */
export function readPageInfo() {
  return {
    title: document.title,
    url: location.href,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

export const PAGE_SCRIPT_OPTIONS = { stateKey: STATE_KEY, settleMs: 150 };
