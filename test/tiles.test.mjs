import { test } from "node:test";
import assert from "node:assert/strict";
import { planCapture, axisOffsets, MAX_CANVAS_DIMENSION } from "../src/lib/tiles.js";

test("axisOffsets ends flush with the page and never repeats", () => {
  assert.deepEqual(axisOffsets(1000, 400), [0, 400, 600]);
  assert.deepEqual(axisOffsets(800, 400), [0, 400]);
  assert.deepEqual(axisOffsets(300, 400), [0]);
  assert.deepEqual(axisOffsets(400, 400), [0]);
});

test("plans a vertical strip for a normal page", () => {
  const plan = planCapture({ pageWidth: 1280, pageHeight: 3000, viewportWidth: 1280, viewportHeight: 900, devicePixelRatio: 1 });
  assert.equal(plan.width, 1280);
  assert.equal(plan.height, 3000);
  assert.equal(plan.trimmed, false);
  assert.deepEqual(plan.tiles.map((tile) => tile.y), [0, 900, 1800, 2100]);
  assert.ok(plan.tiles.every((tile) => tile.x === 0));
});

test("plans a grid when the page is wider than the viewport", () => {
  const plan = planCapture({ pageWidth: 2000, pageHeight: 500, viewportWidth: 1000, viewportHeight: 500 });
  assert.deepEqual(plan.tiles, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
});

test("trims pages taller than the canvas limit, accounting for DPR", () => {
  const plan = planCapture({ pageWidth: 1000, pageHeight: 50000, viewportWidth: 1000, viewportHeight: 800, devicePixelRatio: 2 });
  assert.equal(plan.trimmed, true);
  assert.equal(plan.height, Math.floor(MAX_CANVAS_DIMENSION / 2));
  assert.ok(plan.tiles.at(-1).y + 800 <= plan.height);
});

test("never plans smaller than one viewport", () => {
  const plan = planCapture({ pageWidth: 10, pageHeight: 10, viewportWidth: 1000, viewportHeight: 800 });
  assert.equal(plan.width, 1000);
  assert.equal(plan.height, 800);
  assert.deepEqual(plan.tiles, [{ x: 0, y: 0 }]);
});
