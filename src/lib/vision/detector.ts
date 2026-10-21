import { apply, type BoardPoint, type Homography, type Point } from "./homography";
import type { LumaFrame } from "./luma";

export type DetectorState = "waiting" | "watching" | "motion" | "settling";
export interface DartEvent { kind: "dart"; id: string; at: number; board: BoardPoint; imagePoint: Point; sigma: number; confidence: number }
export type DetectorEvent = DartEvent | { kind: "takeout"; at: number } | { kind: "motion"; at: number }
  | { kind: "noise" | "unsure"; at: number; reason: string };
export interface DetectorParams {
  stableFrames: number;
  stableMs: number;
  motionThreshold: number;
  motionFraction: number;
  diffThreshold: number;
  minArea: number;
  maxArea: number;
  minLength: number;
  minElongation: number;
  largeChangeFraction: number;
  removalFraction: number;
  referenceAlpha: number;
  roiRadius: number;
}
export const DETECTOR_DEFAULTS: DetectorParams = {
  stableFrames: 4, stableMs: 120, motionThreshold: 14, motionFraction: 0.002,
  diffThreshold: 20, minArea: 10, maxArea: 900, minLength: 9, minElongation: 2.5,
  largeChangeFraction: 0.06, removalFraction: 0.6, referenceAlpha: 0.02, roiRadius: 1.25,
};
export interface DetectorOptions {
  width: number;
  height: number;
  frameToBoard: Homography;
  /** Defaults to identity. Rectified/downscaled frames should map back to source-video pixels here. */
  frameToImage?: Homography;
  params?: Partial<DetectorParams>;
  /** Use a per-camera-session prefix if events can outlive a detector instance. */
  idPrefix?: string;
}
/** Learned detectors can implement this contract without changing the camera loop or scoring layer. */
export interface Detector {
  readonly state: DetectorState;
  readonly dartsInVisit: number;
  process(frame: LumaFrame, at: number): DetectorEvent | null;
  reset(): void;
  visit(): void;
}

/** No frame-sized allocations after construction. process() emits at most one event; no event means null. */
export class DartDetector implements Detector {
  state: DetectorState = "waiting";
  dartsInVisit = 0;
  readonly params: Readonly<DetectorParams>;
  private readonly ref: Float32Array;
  private readonly empty: Float32Array;
  private readonly previous: Uint8Array;
  private readonly roi: Uint8Array;
  private readonly occupied: Uint8Array;
  private readonly mask: Uint8Array;
  private readonly clean: Uint8Array;
  private readonly queue: Int32Array;
  private readonly best: Int32Array;
  private readonly histogram = new Int32Array(511);
  private readonly boardMap: Homography;
  private readonly imageMap: Homography;
  private roiCount = 0;
  private hasPrevious = false;
  private stable = 0;
  private stableSince = 0;
  private lastAt = -Infinity;
  private sequence = 0;
  private expectingTakeout = false;

  constructor(private readonly options: DetectorOptions) {
    const { width: w, height: h } = options;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8) throw new Error("Invalid detector frame size");
    this.params = Object.freeze({ ...DETECTOR_DEFAULTS, ...options.params });
    const p = this.params;
    if (!Object.values(p).every(Number.isFinite) || !Number.isInteger(p.stableFrames) || p.stableFrames < 1 || p.stableMs < 0
      || p.motionThreshold <= 0 || p.diffThreshold <= 0 || p.motionFraction <= 0 || p.motionFraction >= 1 || p.minArea < 1 || p.maxArea < p.minArea
      || p.minLength <= 0 || p.minElongation <= 1 || p.largeChangeFraction <= 0 || p.largeChangeFraction > 1 || p.removalFraction <= 0 || p.removalFraction > 1
      || p.referenceAlpha < 0 || p.referenceAlpha > 1 || p.roiRadius < 1) throw new Error("Invalid detector parameters");
    this.boardMap = [...options.frameToBoard];
    this.imageMap = [...(options.frameToImage ?? [1, 0, 0, 0, 1, 0, 0, 0, 1])];
    const n = w * h;
    this.ref = new Float32Array(n); this.empty = new Float32Array(n); this.previous = new Uint8Array(n);
    this.roi = new Uint8Array(n); this.occupied = new Uint8Array(n); this.mask = new Uint8Array(n); this.clean = new Uint8Array(n);
    this.queue = new Int32Array(n); this.best = new Int32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const point = apply(this.boardMap, { x, y });
      if (Math.hypot(point.x, point.y) <= p.roiRadius) { this.roi[y * w + x] = 1; this.roiCount++; }
    }
    if (this.roiCount < 100) throw new Error("Board does not intersect the frame");
  }

  /** Caller must remove darts before reset; stability alone cannot establish that a board is empty. */
  reset() {
    this.state = "waiting"; this.hasPrevious = false; this.stable = 0; this.dartsInVisit = 0;
    this.expectingTakeout = false; this.occupied.fill(0);
  }
  /** Keeps the reference and removal evidence until darts actually disappear. */
  visit() { this.expectingTakeout = true; }

  private shift(data: Uint8Array, ref: Uint8Array | Float32Array): number {
    const histogram = this.histogram; histogram.fill(0);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (this.roi[i]) { histogram[Math.round(data[i] - ref[i]) + 255]++; count++; }
    let sum = 0;
    for (let i = 0; i < 511; i++) { sum += histogram[i]; if (sum > count / 2) return i - 255; }
    return 0;
  }

  process(frame: LumaFrame, at: number): DetectorEvent | null {
    const { width: w, height: h } = this.options, p = this.params, data = frame.data;
    if (frame.width !== w || frame.height !== h || data.length !== w * h || !Number.isFinite(at) || at < this.lastAt) throw new Error("Invalid frame, size or non-monotonic timestamp");
    this.lastAt = at;
    if (!this.hasPrevious) {
      this.previous.set(data); this.hasPrevious = true; this.stableSince = at; return null;
    }
    const shift = this.shift(data, this.previous);
    let moving = 0;
    for (let i = 0; i < w * h; i++) if (this.roi[i] && Math.abs(data[i] - this.previous[i] - shift) > p.motionThreshold) moving++;
    this.previous.set(data);
    const motion = moving / this.roiCount > p.motionFraction;
    if (this.state === "waiting") {
      if (motion) { this.stable = 0; this.stableSince = at; }
      else this.stable++;
      if (this.stable >= p.stableFrames && at - this.stableSince >= p.stableMs) {
        this.ref.set(data); this.empty.set(this.ref); this.state = "watching"; this.stable = 0;
      }
      return null;
    }
    if (motion) {
      const first = this.state !== "motion" && this.state !== "settling";
      this.state = "motion"; this.stable = 0; this.stableSince = at;
      return first ? { kind: "motion", at } : null;
    }
    // Also inspect small persistent changes that never crossed the motion-area threshold.
    const referenceShift = this.shift(data, this.ref);
    let changed = 0;
    for (let i = 0; i < w * h; i++) {
      this.mask[i] = this.roi[i] && Math.abs(data[i] - this.ref[i] - referenceShift) > p.diffThreshold ? 1 : 0;
      changed += this.mask[i];
    }
    if (this.state === "watching" && changed < p.minArea) {
      for (let i = 0; i < w * h; i++) {
        // Apply exposure drift under existing darts too, so the stored empty board still detects their removal.
        const delta = p.referenceAlpha * (this.occupied[i] ? referenceShift : data[i] - this.ref[i]);
        this.ref[i] += delta; this.empty[i] += delta;
      }
      return null;
    }
    if (this.state !== "settling") { this.state = "settling"; this.stable = 0; this.stableSince = at; }
    this.stable++;
    if (this.stable < p.stableFrames || at - this.stableSince < p.stableMs) return null;
    const event = this.classify(data, changed, at);
    // Every settled change becomes the next reference, so a new dart is isolated from earlier ones.
    this.ref.set(data); this.state = "watching"; this.stable = 0;
    return event;
  }

  private classify(data: Uint8Array, changed: number, at: number): DetectorEvent | null {
    const { width: w, height: h } = this.options, p = this.params;
    const emptyShift = this.shift(data, this.empty);
    let occupied = 0, removed = 0;
    for (let i = 0; i < w * h; i++) if (this.occupied[i]) {
      occupied++; if (Math.abs(data[i] - this.empty[i] - emptyShift) < p.diffThreshold) removed++;
    }
    if ((occupied > 0 && removed / occupied >= p.removalFraction) || (this.dartsInVisit > 0 && changed / this.roiCount > p.largeChangeFraction)) {
      this.empty.set(data); this.occupied.fill(0); this.dartsInVisit = 0; this.expectingTakeout = false;
      return { kind: "takeout", at };
    }
    if (changed < p.minArea) return changed ? { kind: "noise", at, reason: "Change below minimum area" } : null;
    if (changed / this.roiCount > p.largeChangeFraction) return { kind: "unsure", at, reason: "Large change: check camera or obstruction" };
    this.clean.fill(0);
    // A neighbour filter removes isolated speckles without eroding the one-pixel point of a dart.
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (this.mask[i]) {
        const count = this.mask[i - w - 1] + this.mask[i - w] + this.mask[i - w + 1] + this.mask[i - 1] + this.mask[i + 1]
          + this.mask[i + w - 1] + this.mask[i + w] + this.mask[i + w + 1];
        if (count >= 2) this.clean[i] = 1;
      }
    }
    let largest = 0, second = 0;
    for (let i = 0; i < w * h; i++) if (this.clean[i] === 1) {
      let head = 0, tail = 1; this.queue[0] = i; this.clean[i] = 2;
      while (head < tail) {
        const j = this.queue[head++];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = j + dy * w + dx;
          if (this.clean[k] === 1) { this.clean[k] = 2; this.queue[tail++] = k; }
        }
      }
      if (tail > largest) { second = largest; largest = tail; for (let j = 0; j < tail; j++) this.best[j] = this.queue[j]; }
      else second = Math.max(second, tail);
    }
    if (largest < p.minArea) return { kind: "noise", at, reason: "No coherent component" };
    if (largest > p.maxArea || second > largest * 0.35) return { kind: "unsure", at, reason: "Multiple or oversized components" };
    let sx = 0, sy = 0, xx = 0, yy = 0, xy = 0;
    for (let i = 0; i < largest; i++) {
      const j = this.best[i], x = j % w, y = Math.floor(j / w);
      sx += x; sy += y; xx += x * x; yy += y * y; xy += x * y;
    }
    const cx = sx / largest, cy = sy / largest;
    xx = xx / largest - cx * cx; yy = yy / largest - cy * cy; xy = xy / largest - cx * cy;
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(angle), uy = Math.sin(angle);
    const spread = Math.hypot(xx - yy, 2 * xy), major = (xx + yy + spread) / 2, minor = Math.max(0, (xx + yy - spread) / 2);
    const elongation = Math.sqrt(major / Math.max(0.2, minor));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < largest; i++) {
      const j = this.best[i], t = (j % w - cx) * ux + (Math.floor(j / w) - cy) * uy;
      lo = Math.min(lo, t); hi = Math.max(hi, t);
    }
    const length = hi - lo;
    if (length < p.minLength || elongation < p.minElongation) return { kind: "unsure", at, reason: "Component is not dart-shaped" };
    let lowCount = 0, highCount = 0, lowWidth = 0, highWidth = 0;
    for (let i = 0; i < largest; i++) {
      const j = this.best[i], x = j % w - cx, y = Math.floor(j / w) - cy, t = x * ux + y * uy, v = -x * uy + y * ux;
      if (t < lo + length * 0.25) { lowCount++; lowWidth += v * v; }
      if (t > hi - length * 0.25) { highCount++; highWidth += v * v; }
    }
    const low = Math.sqrt(lowWidth / Math.max(1, lowCount)) + lowCount / length;
    const high = Math.sqrt(highWidth / Math.max(1, highCount)) + highCount / length;
    const thinLow = low < high;
    let tx = 0, ty = 0, tips = 0;
    for (let i = 0; i < largest; i++) {
      const j = this.best[i], x = j % w, y = Math.floor(j / w), t = (x - cx) * ux + (y - cy) * uy;
      if (thinLow ? t <= lo + 1 : t >= hi - 1) { tx += x; ty += y; tips++; }
    }
    const tip = { x: tx / tips, y: ty / tips }, board = apply(this.boardMap, tip);
    const bx = apply(this.boardMap, { x: tip.x + 1, y: tip.y }), by = apply(this.boardMap, { x: tip.x, y: tip.y + 1 });
    const scale = Math.max(Math.hypot(bx.x - board.x, bx.y - board.y), Math.hypot(by.x - board.x, by.y - board.y));
    const ambiguity = Math.abs(low - high) / Math.max(low, high, 1);
    const outside = Math.max(0, Math.hypot(board.x, board.y) - 1);
    const areaPenalty = Math.max(1, largest / (p.maxArea * 0.6));
    const sigma = Math.min(0.25, Math.max(0.004, scale * (1 + Math.sqrt(minor) * 0.3 + (1 - ambiguity) * 2) * areaPenalty + outside * 0.1));
    const confidence = Math.max(0.05, Math.min(0.98, (1 - 1 / elongation) * (0.4 + 0.6 * ambiguity) / areaPenalty / (1 + outside * 5)
      * (this.dartsInVisit >= 3 || this.expectingTakeout ? 0.65 : 1)));
    for (let i = 0; i < largest; i++) this.occupied[this.best[i]] = 1;
    this.dartsInVisit++;
    return { kind: "dart", id: `${this.options.idPrefix ?? "vision"}-${++this.sequence}`, at, board,
      imagePoint: apply(this.imageMap, tip), sigma, confidence };
  }
}
