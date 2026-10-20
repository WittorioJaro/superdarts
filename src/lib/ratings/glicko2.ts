export interface Rating { rating: number; rd: number; vol: number }
export const DEFAULT_RATING: Rating = { rating: 1500, rd: 350, vol: 0.06 };

/** Glickman's revised (2012) Illinois algorithm, tau 0.5; one call is one rating period. */
export function updateRating(player: Rating, results: { rating: number; rd: number; score: 0 | 0.5 | 1 }[]): Rating {
  const scale = 173.7178;
  const mu = (player.rating - 1500) / scale;
  const phi = player.rd / scale;
  if (!results.length) return { ...player, rd: scale * Math.sqrt(phi * phi + player.vol * player.vol) };
  let variance = 0;
  let improvement = 0;
  for (const r of results) {
    const g = 1 / Math.sqrt(1 + 3 * (r.rd / scale) ** 2 / Math.PI ** 2);
    const e = 1 / (1 + Math.exp(-g * (mu - (r.rating - 1500) / scale)));
    variance += g * g * e * (1 - e);
    improvement += g * (r.score - e);
  }
  const v = 1 / variance;
  const delta = v * improvement;
  const a = Math.log(player.vol ** 2);
  const f = (x: number) => Math.exp(x) * (delta ** 2 - phi ** 2 - v - Math.exp(x)) /
    (2 * (phi ** 2 + v + Math.exp(x)) ** 2) - (x - a) / 0.25;
  let A = a;
  let B: number;
  if (delta ** 2 > phi ** 2 + v) B = Math.log(delta ** 2 - phi ** 2 - v);
  else { let k = 1; while (f(a - k * 0.5) < 0) k++; B = a - k * 0.5; }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 0.000001; i++) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C;
    fB = fC;
  }
  const vol = Math.exp(A / 2);
  const prePhi = Math.sqrt(phi ** 2 + vol ** 2);
  const rd = 1 / Math.sqrt(1 / prePhi ** 2 + 1 / v);
  return { rating: 1500 + scale * (mu + rd ** 2 * improvement), rd: rd * scale, vol };
}
