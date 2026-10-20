import { BOARD_ORDER } from "./darts/board";

/** Ring radii as fractions of the outer double wire, from the regulation board. */
export const RINGS = {
  bull: 6.35 / 170,
  outerBull: 15.9 / 170,
  trebleIn: 99 / 170,
  trebleOut: 107 / 170,
  doubleIn: 162 / 170,
  doubleOut: 1,
};

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

/** SVG path for a ring slice between two radii and two angles (0° is straight up). */
export function wedgePath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

/** Each number with its angular span on the board. */
export const SEGMENTS = BOARD_ORDER.map((n, i) => ({ n, a0: i * 18 - 9, a1: i * 18 + 9, even: i % 2 === 0 }));

export function labelPosition(cx: number, cy: number, r: number, n: number) {
  const i = BOARD_ORDER.indexOf(n);
  return polar(cx, cy, r, i * 18);
}

/** A complete board as a standalone SVG string, used for the app icon. */
export function boardIconSvg(size: number, padding = 0.12) {
  const c = size / 2;
  const R = c * (1 - padding);
  // Rings are drawn thicker than regulation so they read at icon sizes.
  const r = { trebleIn: R * 0.56, trebleOut: R * 0.68, doubleIn: R * 0.86, outerBull: R * 0.16, bull: R * 0.075 };
  const paths: string[] = [];
  for (const s of SEGMENTS) {
    const ring = s.even ? "#e23b3b" : "#22a45d";
    const field = s.even ? "#13221c" : "#f2efe4";
    paths.push(`<path d="${wedgePath(c, c, r.outerBull, r.trebleIn, s.a0, s.a1)}" fill="${field}"/>`);
    paths.push(`<path d="${wedgePath(c, c, r.trebleIn, r.trebleOut, s.a0, s.a1)}" fill="${ring}"/>`);
    paths.push(`<path d="${wedgePath(c, c, r.trebleOut, r.doubleIn, s.a0, s.a1)}" fill="${field}"/>`);
    paths.push(`<path d="${wedgePath(c, c, r.doubleIn, R, s.a0, s.a1)}" fill="${ring}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#0c1713"/><circle cx="${c}" cy="${c}" r="${R + size * 0.02}" fill="#1a2e26"/>${paths.join("")}<circle cx="${c}" cy="${c}" r="${r.outerBull}" fill="#22a45d"/><circle cx="${c}" cy="${c}" r="${r.bull}" fill="#e23b3b"/></svg>`;
}

/** Small repeatable pseudo-random number in [0, 1) from an integer, so a dart sits in the same spot on every render. */
function jitter(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Where to draw a dart we only know as a segment and ring. It goes somewhere inside the right bed,
 * nudged by `seed` so a group of darts in the same bed doesn't stack on one point.
 */
export function dartPoint(cx: number, cy: number, R: number, d: { s: number; m: number }, seed: number): readonly [number, number] {
  const a = jitter(seed);
  const b = jitter(seed + 101);
  if (d.m === 0) return polar(cx, cy, R * (1.06 + a * 0.08), b * 360);
  if (d.s === 25) {
    const r = d.m === 2 ? R * RINGS.bull * a * 0.9 : R * (RINGS.bull + (RINGS.outerBull - RINGS.bull) * (0.2 + a * 0.6));
    return polar(cx, cy, r, b * 360);
  }
  const i = BOARD_ORDER.indexOf(d.s);
  const angle = i * 18 + (b - 0.5) * 14;
  const band =
    d.m === 3
      ? [RINGS.trebleIn, RINGS.trebleOut]
      : d.m === 2
        ? [RINGS.doubleIn, RINGS.doubleOut]
        : a < 0.45
          ? [RINGS.outerBull + 0.04, RINGS.trebleIn - 0.03]
          : [RINGS.trebleOut + 0.03, RINGS.doubleIn - 0.03];
  const t = d.m === 1 ? jitter(seed + 7) : 0.5;
  return polar(cx, cy, R * (band[0] + (band[1] - band[0]) * (0.2 + t * 0.6)), angle);
}
