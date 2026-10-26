import { isPossibleVisitTotal } from "./darts/board";
import { isCheckoutPossible } from "./darts/checkout";
import type { X01Config, X01State } from "./darts/modes/x01";

/** Matches CALLER_VERSION in scripts/generate-caller.ts; the files under it never change. */
const BASE = "/caller/v1/";

/** What the caller says once the dart just thrown has closed a visit, in order. Nothing while a visit is still open. */
export function visitCalls(state: X01State, config: X01Config): string[] {
  if (state.open !== null) return [];
  const turn = state.turns.at(-1);
  if (!turn) return [];
  const ev = state.event;
  if (ev?.type === "match") return ["game-shot-match"];
  if (ev?.type === "set") return ["game-shot-set", "game-on"];
  if (ev?.type === "leg") return ["game-shot-leg", "game-on"];
  const calls = [turn.bust ? "bust" : `score-${turn.points}`];
  // Like at the oche, the next player hears what they need when they step up on a finish.
  const left = state.remaining[state.current];
  if (left >= 2 && left <= 170 && isCheckoutPossible(left, 3, config.out)) calls.push(`require-${left}`);
  return calls;
}

/** Every line a game can call, for warming the cache before the first visit. */
export function allCalls(): string[] {
  const ids = ["game-on", "bust", "game-shot-leg", "game-shot-set", "game-shot-match"];
  for (let n = 0; n <= 180; n++) if (isPossibleVisitTotal(n)) ids.push(`score-${n}`);
  for (let n = 2; n <= 170; n++) ids.push(`require-${n}`);
  return ids;
}

let ctx: AudioContext | null = null;
let playing: AudioBufferSourceNode[] = [];
/** Bumped by every new call and by hush(), so a call that's still loading knows it's been overtaken. */
let generation = 0;
const GAP_S = 0.25;
const SILENCE = 0.01;

function context(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  return ctx;
}

/** A missing or broken clip is just silence; the game never waits on the caller. */
async function load(c: AudioContext, id: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(`${BASE}${id}.mp3`);
    if (!res.ok) return null;
    return await c.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Start and end of the sound in a clip, so lines follow each other as tightly as a real caller's. */
function audible(buf: AudioBuffer): { start: number; end: number } {
  const data = buf.getChannelData(0);
  let first = 0;
  while (first < data.length && Math.abs(data[first]) < SILENCE) first++;
  let last = data.length - 1;
  while (last > first && Math.abs(data[last]) < SILENCE) last--;
  const pad = 0.02 * buf.sampleRate;
  return { start: Math.max(0, first - pad) / buf.sampleRate, end: Math.min(data.length, last + pad) / buf.sampleRate };
}

/**
 * Says the lines one after another, cutting off whatever was being said. Call it straight from the tap that
 * caused it: phones only let a page start sound from inside a tap.
 */
export function say(ids: string[]) {
  const c = context();
  if (!c || ids.length === 0) return;
  hush();
  const mine = generation;
  if (c.state === "suspended") void c.resume();
  // Fetching every clip at once keeps the gap between lines down to the gap we choose.
  const clips = ids.map((id) => load(c, id));
  void (async () => {
    let at = 0;
    for (const clip of clips) {
      const buf = await clip;
      if (mine !== generation) return;
      if (!buf) continue;
      const { start, end } = audible(buf);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      at = Math.max(at, c.currentTime);
      src.start(at, start, end - start);
      playing.push(src);
      at += end - start + GAP_S;
    }
  })();
}

export function hush() {
  generation++;
  for (const src of playing) {
    try {
      src.stop();
    } catch {
      // Already finished.
    }
  }
  playing = [];
}

/**
 * Fetches every clip into the browser cache a few at a time, so calls play instantly later, offline too.
 * Returns a function that stops it.
 */
export function warmCaller(): () => void {
  let stopped = false;
  const queue = allCalls();
  const worker = async () => {
    for (let id = queue.shift(); id && !stopped; id = queue.shift()) {
      await fetch(`${BASE}${id}.mp3`).then((r) => r.arrayBuffer(), () => null);
    }
  };
  for (let i = 0; i < 3; i++) void worker();
  return () => {
    stopped = true;
  };
}
