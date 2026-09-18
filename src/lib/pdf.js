/**
 * Minimal PDF writer: one page containing one JPEG image.
 *
 * The JPEG is embedded as-is with the DCTDecode filter, so no re-encoding
 * happens here. Pure and unit-tested.
 */

const PDF_MAX_PAGE_SIZE = 14400; // PDF user-space units (points); Acrobat limit

/**
 * @param {Uint8Array} jpegBytes  encoded JPEG data (RGB)
 * @param {number} widthPx  image width in pixels
 * @param {number} heightPx image height in pixels
 * @param {{dpi?: number}} [options] resolution used to size the page (default 96)
 * @returns {Uint8Array}
 */
export function createPdfFromJpeg(jpegBytes, widthPx, heightPx, options = {}) {
  if (!(jpegBytes instanceof Uint8Array) || jpegBytes.length === 0) {
    throw new TypeError("jpegBytes must be a non-empty Uint8Array");
  }
  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new RangeError("width and height must be positive integers");
  }

  const dpi = options.dpi > 0 ? options.dpi : 96;
  let pageWidth = (widthPx * 72) / dpi;
  let pageHeight = (heightPx * 72) / dpi;
  const overflow = Math.max(pageWidth, pageHeight) / PDF_MAX_PAGE_SIZE;
  if (overflow > 1) {
    pageWidth /= overflow;
    pageHeight /= overflow;
  }

  const num = (value) => Number(value.toFixed(3)).toString();
  const content = `q ${num(pageWidth)} 0 0 ${num(pageHeight)} 0 0 cm /Im0 Do Q`;

  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let position = 0;

  const push = (chunk) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    position += bytes.length;
  };
  const beginObject = (id) => {
    offsets[id] = position;
    push(`${id} 0 obj\n`);
  };

  push("%PDF-1.4\n%âãÏÓ\n");

  beginObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObject(2);
  push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  beginObject(3);
  push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] ` +
       "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n");

  beginObject(4);
  push(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} ` +
       `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  push(jpegBytes);
  push("\nendstream\nendobj\n");

  beginObject(5);
  push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`);

  const xrefPosition = position;
  const objectCount = 6;
  push(`xref\n0 ${objectCount}\n`);
  push("0000000000 65535 f \n");
  for (let id = 1; id < objectCount; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`);

  const output = new Uint8Array(position);
  let cursor = 0;
  for (const bytes of parts) {
    output.set(bytes, cursor);
    cursor += bytes.length;
  }
  return output;
}
