import { expect, it } from "vitest";
import { createCalibration } from "./calibration";
import { BoardRectifier, LumaProcessor, rgbaToLuma } from "./luma";
it("downscales, blurs and reuses grayscale storage", () => {
  const input = { width: 16, height: 8, data: new Uint8ClampedArray(16 * 8 * 4).fill(255) };
  const processor = new LumaProcessor(8), first = rgbaToLuma(input, 8, processor), data = first.data;
  expect(first.width).toBe(8); expect(first.height).toBe(4); expect([...data].every((v) => v === 255)).toBe(true);
  input.data.fill(0);
  expect(processor.process(input).data).toBe(data); expect(data.every((v) => v === 0)).toBe(true);
  expect(() => processor.process({ ...input, data: [] })).toThrow();
});
it("rectifies an affine gradient with bilinear sampling and reuses output", () => {
  const c = createCalibration({ top: { x: 50, y: 10 }, right: { x: 90, y: 50 }, bottom: { x: 50, y: 90 }, left: { x: 10, y: 50 } }, { width: 100, height: 100 });
  const frame = { width: 100, height: 100, data: Uint8Array.from({ length: 10000 }, (_, i) => i % 100 + Math.floor(i / 100)) };
  const warp = new BoardRectifier(c, undefined, 101, 1);
  const out = warp.process(frame);
  expect(out.data[50 * 101 + 50]).toBe(100); expect(out.data[50 * 101]).toBe(60); expect(out.data[50 * 101 + 100]).toBe(140);
  expect(warp.process(frame)).toBe(out);
});
