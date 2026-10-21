import { describe, expect, it } from "vitest";
import { apply, homography, invert, type Homography } from "./homography";
import { CALIBRATION_POINTS, createCalibration, overlayGeometry, restoreCalibration } from "./calibration";

const corners = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];
const transform: Homography = [250, 30, 450, -10, 180, 300, 0.1, -0.2, 1];
describe("normalized DLT", () => {
  it("fits perspective and round trips interior points with four and many pairs", () => {
    for (const points of [corners, [...corners, { x: 0.2, y: 0.3 }, { x: -0.7, y: 0.2 }]]) {
      const h = homography(points, points.map((p) => apply(transform, p)));
      for (const p of [...points, { x: 0.12, y: -0.56 }]) {
        const q = apply(h, p), expected = apply(transform, p), round = apply(invert(h), q);
        expect(q.x).toBeCloseTo(expected.x, 7); expect(q.y).toBeCloseTo(expected.y, 7);
        expect(round.x).toBeCloseTo(p.x, 8); expect(round.y).toBeCloseTo(p.y, 8);
      }
    }
  });
  it("is stable with large image offsets and noisy overdetermined pairs", () => {
    const from = Array.from({ length: 20 }, (_, i) => ({ x: 1e6 + Math.cos(i) * 1000, y: -2e6 + Math.sin(i) * 1000 }));
    const target = from.map((p, i) => ({ x: (p.x - 1e6) / 1000 + Math.sin(i * 3) * 0.0001, y: (p.y + 2e6) / 1000 }));
    const h = homography(from, target);
    from.forEach((p, i) => { expect(Math.hypot(apply(h, p).x - target[i].x, apply(h, p).y - target[i].y)).toBeLessThan(0.0003); });
  });
  it("rejects deficient inputs and singular inverses", () => {
    expect(() => homography(corners.slice(1), corners.slice(1))).toThrow();
    const line = [0, 1, 2, 3].map((x) => ({ x, y: x * 2 }));
    expect(() => homography(line, corners)).toThrow(/Degenerate/);
    expect(() => invert([1, 0, 0, 1, 0, 0, 0, 0, 1])).toThrow(/Singular/);
    expect(() => homography([{ x: NaN, y: 0 }, ...corners], [...corners, corners[0]])).toThrow();
  });
});

describe("calibration", () => {
  const taps = Object.fromEntries(Object.entries(CALIBRATION_POINTS).map(([key, p]) => [key, apply(transform, p)])) as unknown as typeof CALIBRATION_POINTS;
  it("maps all five taps, persists and projects the board overlay", () => {
    const c = createCalibration(taps, { width: 1000, height: 800 });
    expect(c.quality.rmsPixels).toBeLessThan(1e-6);
    expect(restoreCalibration(JSON.parse(JSON.stringify(c)))).toEqual(c);
    const overlay = overlayGeometry(c);
    expect(overlay.rings).toHaveLength(6); expect(overlay.wires).toHaveLength(20);
    expect(overlay.rings[5][0].x).toBeCloseTo(taps.top.x, 6);
    expect(overlay.rings[5][0].y).toBeCloseTo(taps.top.y, 6);
  });
  it("rejects crossed, tiny and inconsistent taps with a reason", () => {
    expect(() => createCalibration({ ...taps, right: taps.left, left: taps.right }, { width: 1000, height: 800 })).not.toThrow(); // Mirrored cameras are valid.
    expect(() => createCalibration({ ...taps, bottom: taps.right, right: taps.bottom }, { width: 1000, height: 800 })).toThrow(/quad/);
    expect(() => createCalibration({ ...taps, bull: { x: 900, y: 700 } }, { width: 1000, height: 800 })).toThrow();
    expect(restoreCalibration({ version: 2 })).toBeNull();
    expect(restoreCalibration({ version: 1 })).toBeNull();
  });
});
