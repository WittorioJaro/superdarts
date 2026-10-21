import { RINGS } from "../board-geometry";
import { apply, homography, invert, type Homography, type Point } from "./homography";

export interface ImageSize { width: number; height: number }
export interface CalibrationPoints { top: Point; right: Point; bottom: Point; left: Point; bull?: Point }
export const CALIBRATION_POINTS: CalibrationPoints = {
  top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, bull: { x: 0, y: 0 },
};
export interface Calibration {
  version: 1;
  imageSize: ImageSize;
  imagePoints: CalibrationPoints;
  imageToBoard: Homography;
  boardToImage: Homography;
  quality: { rmsPixels: number; maxPixels: number; areaFraction: number; warnings: string[] };
}
export class CalibrationError extends Error {
  constructor(public readonly reason: string) { super(reason); this.name = "CalibrationError"; }
}

/** Taps are source-video pixels, ordered 20 / 6 / 3 / 11 on the OUTER double wire, plus optional bull. */
export function createCalibration(imagePoints: CalibrationPoints, imageSize: ImageSize): Calibration {
  const fail = (reason: string): never => { throw new CalibrationError(reason); };
  if (!Number.isFinite(imageSize.width) || !Number.isFinite(imageSize.height) || imageSize.width <= 0 || imageSize.height <= 0) fail("Invalid image size");
  const keys = ["top", "right", "bottom", "left", ...(imagePoints.bull ? ["bull" as const] : [])] as (keyof CalibrationPoints)[];
  const points = keys.map((key) => imagePoints[key]!);
  if (points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x >= imageSize.width || p.y >= imageSize.height)) fail("Taps must be inside the image");
  let area = 0, sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-5 || (sign && Math.sign(cross) !== sign)) fail("Degenerate, concave or self-intersecting calibration quad");
    sign = Math.sign(cross); area += a.x * b.y - b.x * a.y;
  }
  const areaFraction = Math.abs(area) / (2 * imageSize.width * imageSize.height);
  if (areaFraction < 0.005) fail("Board is too small or viewed too edge-on");
  const board = keys.map((key) => CALIBRATION_POINTS[key]!);
  let boardToImage: Homography, imageToBoard: Homography;
  try { boardToImage = homography(board, points); imageToBoard = invert(boardToImage); }
  catch { return fail("Calibration is numerically degenerate"); }
  // A horizon through the disc can fit four taps but cannot describe a visible planar board.
  if (Math.abs(boardToImage[8]) <= Math.hypot(boardToImage[6], boardToImage[7]) * 1.03) fail("Perspective is too extreme");
  const errors = board.map((p, i) => { const q = apply(boardToImage, p); return Math.hypot(q.x - points[i].x, q.y - points[i].y); });
  const maxPixels = Math.max(...errors), rmsPixels = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  if (maxPixels > Math.max(4, Math.min(imageSize.width, imageSize.height) * 0.02)) fail("Bull and wire taps disagree; retake calibration");
  return { version: 1, imageSize: { ...imageSize }, imagePoints: JSON.parse(JSON.stringify(imagePoints)), imageToBoard, boardToImage,
    quality: { rmsPixels, maxPixels, areaFraction, warnings: areaFraction < 0.05 ? ["Board occupies little of the image"] : [] } };
}

/** Validate persisted JSON by rebuilding the matrices, rather than trusting stored transforms. */
export function restoreCalibration(value: unknown): Calibration | null {
  try {
    const v = value as Calibration;
    return v?.version === 1 ? createCalibration(v.imagePoints, v.imageSize) : null;
  } catch { return null; }
}

export function overlayGeometry(calibration: Calibration, samples = 120): { rings: Point[][]; wires: Point[][] } {
  if (!Number.isInteger(samples) || samples < 12 || samples > 1000) throw new Error("Use 12–1000 circle samples");
  const project = (r: number, angle: number) => apply(calibration.boardToImage, { x: r * Math.sin(angle), y: -r * Math.cos(angle) });
  return {
    rings: Object.values(RINGS).map((r) => Array.from({ length: samples + 1 }, (_, i) => project(r, i * Math.PI * 2 / samples))),
    wires: Array.from({ length: 20 }, (_, i) => {
      const a = (i * 18 + 9) * Math.PI / 180;
      return Array.from({ length: 17 }, (_, j) => project(RINGS.outerBull + (1 - RINGS.outerBull) * j / 16, a));
    }),
  };
}
