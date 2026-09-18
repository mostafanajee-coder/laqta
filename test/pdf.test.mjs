import { test } from "node:test";
import assert from "node:assert/strict";
import { createPdfFromJpeg } from "../src/lib/pdf.js";

const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const latin1 = (bytes) => Buffer.from(bytes).toString("latin1");

test("produces a structurally valid single-page PDF", () => {
  const pdf = createPdfFromJpeg(fakeJpeg, 800, 600);
  const text = latin1(pdf);

  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.endsWith("%%EOF\n"));
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /\/Count 1/);
  assert.match(text, /\/Width 800 \/Height 600/);
  assert.match(text, /\/Filter \/DCTDecode \/Length 10/);
  assert.match(text, /\/MediaBox \[0 0 600 450\]/); // 96 dpi -> 72 pt per 96 px

  // Every xref entry must point at "N 0 obj".
  const xrefOffset = Number(text.match(/startxref\n(\d+)\n/)[1]);
  assert.equal(text.slice(xrefOffset, xrefOffset + 4), "xref");
  const entries = [...text.slice(xrefOffset).matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, 5);
  entries.forEach((offset, index) => {
    assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`);
  });

  // The JPEG bytes are embedded verbatim.
  const streamStart = text.indexOf("stream\n", text.indexOf("/DCTDecode")) + "stream\n".length;
  assert.deepEqual(Array.from(pdf.slice(streamStart, streamStart + fakeJpeg.length)), Array.from(fakeJpeg));
});

test("scales oversized pages to the PDF limit", () => {
  const text = latin1(createPdfFromJpeg(fakeJpeg, 1000, 40000));
  const [, width, height] = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  assert.equal(Number(height), 14400);
  assert.equal(Number(width), 360);
  assert.match(text, /\/Width 1000 \/Height 40000/);
});

test("rejects invalid input", () => {
  assert.throws(() => createPdfFromJpeg(new Uint8Array(), 10, 10), TypeError);
  assert.throws(() => createPdfFromJpeg(fakeJpeg, 0, 10), RangeError);
  assert.throws(() => createPdfFromJpeg(fakeJpeg, 10.5, 10), RangeError);
});
