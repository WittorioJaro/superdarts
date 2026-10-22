import { describe, expect, it } from "vitest";
import { createCalibration } from "./calibration";
import { DartDetector, type DartEvent, type DetectorEvent } from "./detector";
import { apply, invert, type Homography, type Point } from "./homography";
import { BoardRectifier, LumaProcessor, type LumaFrame } from "./luma";
import { scoreAt, scoreDistribution } from "./score";

const width = 320, height = 256;
const boardToImage: Homography = [116, 18, 160, -5, 90, 120, 0.1, -0.13, 1];
const imageToBoard = invert(boardToImage);
const t20 = { x: 0, y: -(99 + 107) / 340 };
const s6 = { x: 0.78, y: 0 };
function render(darts: Point[] = [], brightness = 0, hand = false, direction = 0): LumaFrame {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = apply(imageToBoard, { x, y });
    let value = Math.hypot(p.x, p.y) < 1 ? 195 : 45;
    for (const tip of darts) {
      const angle = direction + Math.PI / 4, ux = Math.cos(angle), uy = Math.sin(angle);
      const dx = p.x - tip.x, dy = p.y - tip.y, t = dx * ux + dy * uy, v = Math.abs(-dx * uy + dy * ux);
      // The shaft starts at the board; the flight widens away from the landing point.
      if (t >= 0 && t <= 0.38 && v <= (t < 0.27 ? 0.010 : 0.014 + (t - 0.27) * 0.28)) value = 25;
    }
    if (hand && x > 70 && x < 250 && y > 60 && y < 210) value = 95;
    data[y * width + x] = Math.max(0, Math.min(255, value + brightness));
  }
  return { data, width, height };
}
function calibration() {
  return createCalibration({ top: apply(boardToImage, { x: 0, y: -1 }), right: apply(boardToImage, { x: 1, y: 0 }),
    bottom: apply(boardToImage, { x: 0, y: 1 }), left: apply(boardToImage, { x: -1, y: 0 }), bull: apply(boardToImage, { x: 0, y: 0 }) }, { width, height });
}
function setup(rectified = true) {
  const c = calibration(), warp = new BoardRectifier(c), gray = new LumaProcessor(width);
  const detector = new DartDetector({ width: rectified ? 256 : width, height: rectified ? 256 : height,
    frameToBoard: rectified ? warp.frameToBoard : imageToBoard,
    frameToImage: rectified ? warp.frameToImage : undefined, idPrefix: "test" });
  let at = 0;
  const events: DetectorEvent[] = [];
  const feed = (frame: LumaFrame, count = 8) => {
    const rgba = new Uint8ClampedArray(frame.data.length * 4);
    for (let i = 0; i < frame.data.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = frame.data[i]; rgba[i * 4 + 3] = 255; }
    for (let i = 0; i < count; i++) {
      const luma = gray.process({ width, height, data: rgba });
      const event = detector.process(rectified ? warp.process(luma) : luma, at += 40);
      if (event) events.push(event);
    }
  };
  return { detector, feed, events };
}

describe("classical detector synthetic end-to-end", () => {
  it("finds the thin tip under perspective, and scores each new dart once", () => {
    for (const rectified of [false, true]) for (const direction of [0, Math.PI / 2, Math.PI]) {
      const { detector, feed, events } = setup(rectified);
      feed(render()); expect(detector.state).toBe("watching");
      feed(render([], 0, true), 2); feed(render([t20], 0, false, direction)); feed(render([t20], 0, false, direction));
      const darts = events.filter((e): e is DartEvent => e.kind === "dart");
      expect(darts, JSON.stringify(events)).toHaveLength(1);
      const dart = darts[0];
      expect(Math.hypot(dart.board.x - t20.x, dart.board.y - t20.y)).toBeLessThan(0.025);
      expect(scoreAt(dart.board)).toEqual({ s: 20, m: 3 });
      expect(scoreDistribution(dart.board, dart.sigma)[0].dart).toEqual({ s: 20, m: 3 });
      const image = apply(boardToImage, t20);
      expect(Math.hypot(dart.imagePoint.x - image.x, dart.imagePoint.y - image.y)).toBeLessThan(3);
      expect(dart.confidence).toBeGreaterThan(0.25);
      feed(render([t20, s6], 0, false, direction));
      const next = events.filter((e): e is DartEvent => e.kind === "dart");
      expect(next, JSON.stringify(events)).toHaveLength(2);
      expect(scoreAt(next[1].board)).toEqual({ s: 6, m: 1 }); expect(next[0].id).not.toBe(next[1].id);
      expect(detector.dartsInVisit).toBe(2);
      detector.visit(); feed(render());
      expect(events.filter((e) => e.kind === "takeout")).toHaveLength(1); expect(detector.dartsInVisit).toBe(0);
    }
  });
  it("ignores global brightness shifts and slow drift, and resumes after reset", () => {
    const { detector, feed, events } = setup(); feed(render());
    feed(render([], 28)); feed(render([], -20));
    for (let brightness = -20; brightness <= 20; brightness += 2) feed(render([], brightness), 2);
    expect(events.filter((e) => e.kind === "dart")).toHaveLength(0);
    detector.reset(); expect(detector.state).toBe("waiting"); feed(render()); feed(render([t20]));
    expect(events.filter((e) => e.kind === "dart")).toHaveLength(1);
  });
  it("preserves removal evidence across sustained exposure drift while darts remain", () => {
    const { detector, feed, events } = setup();
    feed(render()); feed(render([t20]));
    feed(render([t20], 40), 160); detector.visit(); feed(render([], 40));
    expect(events.filter((e) => e.kind === "dart")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "takeout")).toHaveLength(1);
    expect(detector.dartsInVisit).toBe(0);
  });
  it("keeps detecting beyond three darts with reduced confidence", () => {
    const { detector, feed, events } = setup(); feed(render());
    const tips = [t20, { x: 0.55, y: -0.45 }, { x: -0.6, y: -0.2 }, { x: -0.4, y: 0.5 }];
    for (let i = 1; i <= tips.length; i++) feed(render(tips.slice(0, i)));
    expect(events.filter((e) => e.kind === "dart"), JSON.stringify(events)).toHaveLength(4);
    expect(detector.dartsInVisit).toBe(4);
  });
  it("reports a settled hand as unsure, never a dart", () => {
    const { feed, events } = setup(); feed(render()); feed(render([], 0, true));
    expect(events.some((e) => e.kind === "unsure")).toBe(true); expect(events.some((e) => e.kind === "dart")).toBe(false);
  });
  it("benchmarks warmed 320px detection, preprocessing, rectification and scoring", () => {
    const empty = render(), dart = render([t20]);
    const detector = new DartDetector({ width, height, frameToBoard: imageToBoard });
    let at = 0;
    for (let i = 0; i < 30; i++) detector.process(empty, at += 40);
    const costs: number[] = [], settledCosts: number[] = [];
    for (let round = 0; round < 30; round++) {
      for (const frame of [dart, empty]) for (let i = 0; i < 8; i++) {
        const start = performance.now(), event = detector.process(frame, at += 40), elapsed = performance.now() - start;
        costs.push(elapsed); if (event?.kind === "dart" || event?.kind === "takeout") settledCosts.push(elapsed);
      }
    }
    const rgba = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(195) };
    const luma = new LumaProcessor(320), warp = new BoardRectifier(calibration());
    const measure = (fn: () => unknown, count: number) => {
      for (let i = 0; i < 20; i++) fn();
      const start = performance.now(); for (let i = 0; i < count; i++) fn(); return (performance.now() - start) / count;
    };
    const average = costs.reduce((s, v) => s + v, 0) / costs.length;
    const sorted = costs.toSorted((a, b) => a - b);
    const metrics = { detectorMeanMs: average, detectorP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      settledMeanMs: settledCosts.reduce((s, v) => s + v, 0) / settledCosts.length,
      rgbaBlurMs: measure(() => luma.process(rgba), 100), rectifyMs: measure(() => warp.process(empty), 100),
      distributionMs: measure(() => scoreDistribution(t20, 0.015), 1000) };
    console.info("vision benchmark (host CPU, 320×256 input):", JSON.stringify(metrics));
    expect(settledCosts.length).toBeGreaterThan(0); expect(average).toBeLessThan(20); expect(metrics.distributionMs).toBeLessThan(1);
  });
});
