/** A visit as stats need it; built from engine turns on the device or from `turns` rows on the server. */
export interface StatTurn {
  points: number;
  darts: number;
  bust: boolean;
  checkout: boolean;
  startScore: number | null;
  visit: number;
  /** Identifies the leg across games, e.g. `${gameId}:${leg}`. */
  legKey: string;
}

export interface ScoringStats {
  average: number;
  first9: number;
  darts: number;
  visits: number;
  highest: number;
  n180: number;
  n140: number;
  n100: number;
  n60: number;
  checkouts: number;
  checkoutAttempts: number;
  checkoutPct: number;
  highestCheckout: number;
  /** Fewest darts to win a 501 leg. */
  bestLeg: number | null;
  dartsPerLeg: number | null;
}

export function scoringStats(turns: StatTurn[], checkoutAttempts: number): ScoringStats {
  let points = 0;
  let darts = 0;
  let f9Points = 0;
  let f9Darts = 0;
  const s: ScoringStats = {
    average: 0,
    first9: 0,
    darts: 0,
    visits: turns.length,
    highest: 0,
    n180: 0,
    n140: 0,
    n100: 0,
    n60: 0,
    checkouts: 0,
    checkoutAttempts,
    checkoutPct: 0,
    highestCheckout: 0,
    bestLeg: null,
    dartsPerLeg: null,
  };
  const legDarts = new Map<string, { darts: number; start: number | null; won: boolean }>();

  for (const t of turns) {
    const scored = t.bust ? 0 : t.points;
    points += scored;
    darts += t.darts;
    if (t.visit < 3) {
      f9Points += scored;
      f9Darts += t.darts;
    }
    s.highest = Math.max(s.highest, scored);
    if (scored === 180) s.n180++;
    else if (scored >= 140) s.n140++;
    else if (scored >= 100) s.n100++;
    else if (scored >= 60) s.n60++;
    if (t.checkout) {
      s.checkouts++;
      s.highestCheckout = Math.max(s.highestCheckout, t.startScore ?? scored);
    }
    const leg = legDarts.get(t.legKey) ?? { darts: 0, start: null, won: false };
    leg.darts += t.darts;
    if (t.visit === 0) leg.start = t.startScore;
    leg.won ||= t.checkout;
    legDarts.set(t.legKey, leg);
  }

  for (const leg of legDarts.values()) {
    if (leg.won && leg.start === 501 && (s.bestLeg === null || leg.darts < s.bestLeg)) s.bestLeg = leg.darts;
  }

  const won501 = [...legDarts.values()].filter((leg) => leg.won && leg.start === 501);
  s.dartsPerLeg = won501.length ? won501.reduce((n, leg) => n + leg.darts, 0) / won501.length : null;
  s.darts = darts;
  s.average = darts ? (points / darts) * 3 : 0;
  s.first9 = f9Darts ? (f9Points / f9Darts) * 3 : 0;
  s.checkoutPct = checkoutAttempts ? (s.checkouts / checkoutAttempts) * 100 : 0;
  return s;
}

export function fmtAvg(n: number | null | undefined) {
  return n === null || n === undefined || Number.isNaN(n) ? "–" : n.toFixed(1);
}

export function fmtPct(n: number | null | undefined) {
  return n === null || n === undefined || Number.isNaN(n) ? "–" : `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

/** MPR counts all useful cricket marks, including scoring marks on open numbers. */
export function cricketMpr(turns: { darts: { s: number; m: number; marks?: number }[] }[]): number | null {
  const darts = turns.flatMap((t) => t.darts);
  return darts.length ? 3 * darts.reduce((n, d) => n + (d.marks ?? ([20, 19, 18, 17, 16, 15, 25].includes(d.s) ? d.m : 0)), 0) / darts.length : null;
}
