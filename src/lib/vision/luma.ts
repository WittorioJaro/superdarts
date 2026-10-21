import type { Calibration, ImageSize } from "./calibration";
import { apply, multiply, type Homography } from "./homography";

export interface RgbaFrame { data: ArrayLike<number>; width: number; height: number }
export interface LumaFrame { data: Uint8Array; width: number; height: number }
function validSize(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("Invalid frame size");
}

/** Reuses all storage after the first frame / a resolution change. Returned frame is overwritten on next process(). */
export class LumaProcessor {
  readonly frame: LumaFrame = { data: new Uint8Array(0), width: 0, height: 0 };
  private raw = new Uint8Array(0);
  private horizontal = new Uint16Array(0);
  constructor(readonly targetWidth = 320) { validSize(targetWidth, 1); }
  process(source: RgbaFrame): LumaFrame {
    validSize(source.width, source.height);
    if (source.data.length < source.width * source.height * 4) throw new Error("Truncated RGBA frame");
    const w = Math.min(this.targetWidth, source.width), h = Math.max(1, Math.round(source.height * w / source.width));
    if (w !== this.frame.width || h !== this.frame.height) {
      this.frame.width = w; this.frame.height = h; this.frame.data = new Uint8Array(w * h);
      this.raw = new Uint8Array(w * h); this.horizontal = new Uint16Array(w * h);
    }
    const sx = source.width / w, sy = source.height / h, data = source.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (Math.min(source.height - 1, Math.floor((y + 0.5) * sy)) * source.width + Math.min(source.width - 1, Math.floor((x + 0.5) * sx))) * 4;
      this.raw[y * w + x] = (77 * data[i] + 150 * data[i + 1] + 29 * data[i + 2]) >> 8;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      this.horizontal[i] = this.raw[i - (x > 0 ? 1 : 0)] + this.raw[i] + this.raw[i + (x < w - 1 ? 1 : 0)];
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      this.frame.data[i] = Math.round((this.horizontal[i - (y > 0 ? w : 0)] + this.horizontal[i] + this.horizontal[i + (y < h - 1 ? w : 0)]) / 9);
    }
    return this.frame;
  }
}

export function rgbaToLuma(source: RgbaFrame, targetWidth = 320, reuse?: LumaProcessor): LumaFrame {
  if (reuse && reuse.targetWidth !== targetWidth) throw new Error("Processor target width differs");
  return (reuse ?? new LumaProcessor(targetWidth)).process(source);
}

/** Bilinear warp with cached sampling map; construct once per calibration/source resolution. */
export class BoardRectifier {
  readonly frame: LumaFrame;
  readonly frameToBoard: Homography;
  readonly frameToImage: Homography;
  private readonly indices: Int32Array;
  private readonly fx: Float32Array;
  private readonly fy: Float32Array;
  constructor(calibration: Calibration, readonly sourceSize: ImageSize = calibration.imageSize, size = 256, extent = 1.2) {
    validSize(size, size); validSize(sourceSize.width, sourceSize.height);
    if (!Number.isFinite(extent) || extent < 1 || extent > 3 || size < 2) throw new Error("Invalid rectification extent/size");
    this.frame = { width: size, height: size, data: new Uint8Array(size * size) };
    const scale = 2 * extent / (size - 1);
    this.frameToBoard = [scale, 0, -extent, 0, scale, -extent, 0, 0, 1];
    this.frameToImage = multiply(calibration.boardToImage, this.frameToBoard);
    const imageToSource: Homography = [sourceSize.width / calibration.imageSize.width, 0, 0, 0, sourceSize.height / calibration.imageSize.height, 0, 0, 0, 1];
    const map = multiply(imageToSource, this.frameToImage);
    this.indices = new Int32Array(size * size); this.fx = new Float32Array(size * size); this.fy = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, p = apply(map, { x, y }), xx = Math.floor(p.x), yy = Math.floor(p.y);
      this.indices[i] = xx < 0 || yy < 0 || xx >= sourceSize.width - 1 || yy >= sourceSize.height - 1 ? -1 : yy * sourceSize.width + xx;
      this.fx[i] = p.x - xx; this.fy[i] = p.y - yy;
    }
  }
  process(source: LumaFrame): LumaFrame {
    if (source.width !== this.sourceSize.width || source.height !== this.sourceSize.height || source.data.length < source.width * source.height) throw new Error("Rectifier source size changed");
    const data = source.data, out = this.frame.data, w = source.width;
    for (let i = 0; i < out.length; i++) {
      const j = this.indices[i];
      if (j < 0) { out[i] = 0; continue; }
      const x = this.fx[i], y = this.fy[i];
      out[i] = Math.round((data[j] * (1 - x) + data[j + 1] * x) * (1 - y) + (data[j + w] * (1 - x) + data[j + w + 1] * x) * y);
    }
    return this.frame;
  }
}
