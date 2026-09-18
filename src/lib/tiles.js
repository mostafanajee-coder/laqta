/**
 * Planning for full-page captures. Pure, unit-tested.
 *
 * A page is captured as a grid of viewport-sized tiles. Canvases are limited
 * to MAX_CANVAS_DIMENSION device pixels per side, so very tall pages are
 * trimmed rather than failing.
 */

export const MAX_CANVAS_DIMENSION = 16384;

/**
 * @param {{pageWidth: number, pageHeight: number, viewportWidth: number, viewportHeight: number, devicePixelRatio?: number}} metrics
 *        sizes in CSS pixels
 * @returns {{width: number, height: number, trimmed: boolean, tiles: Array<{x: number, y: number}>}}
 */
export function planCapture(metrics) {
  const dpr = metrics.devicePixelRatio > 0 ? metrics.devicePixelRatio : 1;
  const viewportWidth = Math.max(1, Math.floor(metrics.viewportWidth));
  const viewportHeight = Math.max(1, Math.floor(metrics.viewportHeight));
  const limit = Math.floor(MAX_CANVAS_DIMENSION / dpr);

  const requestedWidth = Math.max(viewportWidth, Math.ceil(metrics.pageWidth || 0));
  const requestedHeight = Math.max(viewportHeight, Math.ceil(metrics.pageHeight || 0));
  const width = Math.min(requestedWidth, limit);
  const height = Math.min(requestedHeight, limit);
  const trimmed = width < requestedWidth || height < requestedHeight;

  const xs = axisOffsets(width, viewportWidth);
  const ys = axisOffsets(height, viewportHeight);
  const tiles = [];
  for (const y of ys) {
    for (const x of xs) tiles.push({ x, y });
  }
  return { width, height, trimmed, tiles };
}

/** Scroll offsets that cover `total` with steps of `step`, ending flush with the end. */
export function axisOffsets(total, step) {
  const offsets = [];
  for (let position = 0; position + step < total; position += step) offsets.push(position);
  offsets.push(Math.max(0, total - step));
  return [...new Set(offsets)];
}
