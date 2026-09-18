/** Image helpers shared by the service worker and the viewer (OffscreenCanvas). */

export async function blobFromDataUrl(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

/** Decode a Blob or data URL into an ImageBitmap. */
export async function toBitmap(source) {
  const blob = typeof source === "string" ? await blobFromDataUrl(source) : source;
  return createImageBitmap(blob);
}

/**
 * Crop a bitmap. The rectangle is in device pixels and is clamped to the bitmap.
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
export async function cropBitmap(bitmap, rect) {
  const x = clamp(Math.round(rect.x), 0, bitmap.width);
  const y = clamp(Math.round(rect.y), 0, bitmap.height);
  const width = clamp(Math.round(rect.width), 1, bitmap.width - x);
  const height = clamp(Math.round(rect.height), 1, bitmap.height - y);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  return { blob: await canvas.convertToBlob({ type: "image/png" }), width, height };
}

/** Re-encode a PNG blob as JPEG (white background). */
export async function toJpeg(blob, quality = 0.92) {
  const bitmap = await toBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  } finally {
    bitmap.close();
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
