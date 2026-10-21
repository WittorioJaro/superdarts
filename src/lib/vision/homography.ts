export interface Point { x: number; y: number }
export type BoardPoint = Point;
/** Row-major 3×3 projective matrix; plain arrays survive JSON round trips. */
export type Homography = [number, number, number, number, number, number, number, number, number];

export function apply(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-14) throw new Error("Point lies on the projective horizon");
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function multiply(a: Homography, b: Homography): Homography {
  const out = Array(9).fill(0) as Homography;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
}

export function invert(h: Homography): Homography {
  const [a, b, c, d, e, f, g, j, i] = h;
  const out: Homography = [e * i - f * j, c * j - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * j - e * g, b * g - a * j, a * e - b * d];
  const det = a * out[0] + b * out[3] + c * out[6];
  const scale = Math.hypot(a, b, c) * Math.hypot(d, e, f) * Math.hypot(g, j, i);
  if (!Number.isFinite(det) || Math.abs(det) <= 1e-14 * scale) throw new Error("Singular homography");
  return out.map((v) => v / det) as Homography;
}

function normalize(points: readonly Point[]) {
  if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) throw new Error("Non-finite point");
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  const distance = points.reduce((s, p) => s + Math.hypot(p.x - x, p.y - y), 0) / points.length;
  if (distance < 1e-12) throw new Error("Coincident points");
  const s = Math.SQRT2 / distance;
  const matrix: Homography = [s, 0, -s * x, 0, s, -s * y, 0, 0, 1];
  return { matrix, points: points.map((p) => apply(matrix, p)) };
}

/** Hartley-normalized DLT. Fits all pairs, including noisy overdetermined inputs; rejects rank deficiency. */
export function homography(from: readonly Point[], to: readonly Point[]): Homography {
  if (from.length < 4 || from.length !== to.length) throw new Error("At least four matching point pairs required");
  const src = normalize(from), dst = normalize(to);
  const a = new Float64Array(81), vectors = new Float64Array(81);
  for (let i = 0; i < 9; i++) vectors[i * 9 + i] = 1;
  for (let i = 0; i < from.length; i++) {
    const { x, y } = src.points[i], { x: u, y: v } = dst.points[i];
    for (const row of [[-x, -y, -1, 0, 0, 0, u * x, u * y, u], [0, 0, 0, -x, -y, -1, v * x, v * y, v]]) {
      for (let j = 0; j < 9; j++) for (let k = 0; k < 9; k++) a[j * 9 + k] += row[j] * row[k];
    }
  }
  // Jacobi on the small symmetric normal matrix avoids a dependency on a general SVD library.
  for (let iteration = 0; iteration < 3000; iteration++) {
    let p = 0, q = 1, largest = 0;
    for (let j = 0; j < 9; j++) for (let k = j + 1; k < 9; k++) if (Math.abs(a[j * 9 + k]) > largest) {
      largest = Math.abs(a[j * 9 + k]); p = j; q = k;
    }
    if (largest < 1e-13) break;
    const angle = 0.5 * Math.atan2(2 * a[p * 9 + q], a[q * 9 + q] - a[p * 9 + p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const pp = a[p * 9 + p], qq = a[q * 9 + q], pq = a[p * 9 + q];
    for (let j = 0; j < 9; j++) if (j !== p && j !== q) {
      const jp = a[j * 9 + p], jq = a[j * 9 + q];
      a[j * 9 + p] = a[p * 9 + j] = c * jp - s * jq;
      a[j * 9 + q] = a[q * 9 + j] = s * jp + c * jq;
    }
    a[p * 9 + p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    a[q * 9 + q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    a[p * 9 + q] = a[q * 9 + p] = 0;
    for (let j = 0; j < 9; j++) {
      const jp = vectors[j * 9 + p], jq = vectors[j * 9 + q];
      vectors[j * 9 + p] = c * jp - s * jq; vectors[j * 9 + q] = s * jp + c * jq;
    }
  }
  const order = Array.from({ length: 9 }, (_, i) => i).sort((i, j) => a[i * 9 + i] - a[j * 9 + j]);
  if (a[order[1] * 9 + order[1]] < a[order[8] * 9 + order[8]] * 1e-10) throw new Error("Degenerate point configuration");
  const h = Array.from({ length: 9 }, (_, j) => vectors[j * 9 + order[0]]) as Homography;
  const result = multiply(multiply(invert(dst.matrix), h), src.matrix);
  const scale = Math.abs(result[8]) > 1e-12 ? result[8] : Math.hypot(...result);
  return result.map((v) => v / scale) as Homography;
}
