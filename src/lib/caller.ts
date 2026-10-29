import { useSyncExternalStore } from "react";
import { allCalls } from "./caller-calls";

/** The good darts shows' sounds, recorded alongside the caller's lines. */
export const SOUND_EFFECTS = ["sfx-applause", "sfx-fire", "sfx-fanfare", "sfx-beer", "sfx-fireworks"] as const;
export type SoundEffect = (typeof SOUND_EFFECTS)[number];

/** Matches CALLER_VERSION in scripts/generate-caller.ts; the files under it never change. */
const BASE = "/caller/v2/";

export type CallerSettings = { on: boolean; volume: number };
const KEY = "superdarts.caller";
const DEFAULTS: CallerSettings = { on: true, volume: 0.8 };

// The caller belongs to the device, not to a player or a pub table, so it keeps its own key.
let settings: CallerSettings | null = null;
const listeners = new Set<() => void>();

function readSettings(): CallerSettings {
  if (settings) return settings;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<CallerSettings>;
    settings = {
      on: typeof saved.on === "boolean" ? saved.on : DEFAULTS.on,
      volume: typeof saved.volume === "number" ? Math.min(1, Math.max(0, saved.volume)) : DEFAULTS.volume,
    };
  } catch {
    settings = DEFAULTS;
  }
  return settings;
}

function subscribe(l: () => void) {
  listeners.add(l);
  const other = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    settings = null;
    l();
  };
  window.addEventListener("storage", other);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", other);
  };
}

export function useCallerSettings(): CallerSettings {
  return useSyncExternalStore(subscribe, readSettings, () => DEFAULTS);
}

export function setCallerSettings(patch: Partial<CallerSettings>) {
  settings = { ...readSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(settings));
  if (gain) gain.gain.value = loudness(settings.volume);
  if (!settings.on) hush();
  for (const l of listeners) l();
}

/** Ears hear loudness roughly logarithmically; squaring makes the slider's middle sound like the middle. */
const loudness = (volume: number) => volume * volume;

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let playing: AudioBufferSourceNode[] = [];
let effects: AudioBufferSourceNode[] = [];
let effectGeneration = 0;
/** Bumped by every new call and by hush(), so a call that's still loading knows it's been overtaken. */
let generation = 0;
const GAP_S = 0.25;
const SILENCE = 0.01;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
let rooms = 0;

/**
 * Web Audio on iPhones plays like a ringtone and goes quiet with the silent switch. Asking for "playback"
 * (Safari 17+) makes it play like a video instead. Android already plays it on the media volume.
 */
function claimSession() {
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session) session.type = rooms > 0 ? "auto" : "playback";
}

/**
 * A room's video call needs the microphone, which the "playback" session would take from it. While a room is
 * open the caller plays as ordinary page audio instead. Returns the release.
 */
export function holdSessionForRoom(): () => void {
  rooms++;
  if (ctx) claimSession();
  return () => {
    rooms--;
    if (ctx) claimSession();
  };
}

function context(): { c: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!ctx) {
    claimSession();
    ctx = new AudioContext();
    gain = ctx.createGain();
    gain.gain.value = loudness(readSettings().volume);
    gain.connect(ctx.destination);
  }
  return { c: ctx, out: gain! };
}

if (typeof window !== "undefined") {
  // Calls for a bot's or a friend's darts don't come from a tap, and phones only start audio from one. Any tap
  // wakes it, so it's ready for them.
  window.addEventListener(
    "pointerdown",
    () => {
      if (!readSettings().on) return;
      const audio = context();
      if (audio?.c.state === "suspended") void audio.c.resume();
    },
    { capture: true, passive: true },
  );
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
  if (ids.length === 0 || !readSettings().on) return;
  const audio = context();
  if (!audio) return;
  const { c, out } = audio;
  stopLines();
  const mine = generation;
  if (c.state === "suspended") void c.resume();
  // Fetching every clip at once keeps the gap between lines down to the gap we choose.
  const clips = ids.map((id) => load(c, id));
  void (async () => {
    let at = 0;
    for (const [i, clip] of clips.entries()) {
      const buf = await clip;
      if (mine !== generation) return;
      if (!buf) {
        at = speakInstead(ids[i], c, at, mine);
        continue;
      }
      const { start, end } = audible(buf);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      at = Math.max(at, c.currentTime);
      src.start(at, start, end - start);
      playing.push(src);
      at += end - start + GAP_S;
    }
  })();
}

/** Lines the browser's own voice can stand in for until their clip is recorded. */
const SPOKEN: Record<string, string> = { "good-darts": "Good darts!" };

/** Says a missing clip's line with the browser's voice, in its place in the call. Returns when the next line can start. */
function speakInstead(id: string, c: AudioContext, at: number, mine: number): number {
  const text = SPOKEN[id];
  if (!text || !("speechSynthesis" in window)) return at;
  const start = Math.max(at, c.currentTime);
  setTimeout(() => {
    if (mine !== generation) return;
    const line = new SpeechSynthesisUtterance(text);
    line.lang = "en-GB";
    line.rate = 1.05;
    line.pitch = 1.15;
    line.volume = readSettings().volume;
    speechSynthesis.speak(line);
  }, (start - c.currentTime) * 1000);
  return start + 1.1 + GAP_S;
}

/**
 * Plays a sound effect under the caller, quieter than the voice. A new call doesn't cut it off; hush() does.
 * The show can start a moment before its call, so only an undo or leaving the game stops it.
 */
export function play(id: string, volume = 0.6) {
  if (!readSettings().on) return;
  const audio = context();
  if (!audio) return;
  const { c, out } = audio;
  const mine = effectGeneration;
  if (c.state === "suspended") void c.resume();
  void load(c, id).then((buf) => {
    if (!buf || mine !== effectGeneration) return;
    const level = c.createGain();
    level.gain.value = volume;
    level.connect(out);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(level);
    src.onended = () => (effects = effects.filter((e) => e !== src));
    src.start();
    effects.push(src);
  });
}

/** Cuts off the caller and any sound effect. */
export function hush() {
  stopLines();
  effectGeneration++;
  stopAll(effects);
  effects = [];
}

function stopLines() {
  generation++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
  stopAll(playing);
  playing = [];
}

function stopAll(sources: AudioBufferSourceNode[]) {
  for (const src of sources) {
    try {
      src.stop();
    } catch {
      // Already finished.
    }
  }
}

/**
 * Fetches every clip into the browser cache a few at a time, so calls play instantly later, offline too.
 * Returns a function that stops it.
 */
export function warmCaller(): () => void {
  let stopped = false;
  const queue = [...allCalls(), ...SOUND_EFFECTS];
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
