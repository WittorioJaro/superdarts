/**
 * Records the caller's lines with ElevenLabs into public/caller/v1, one mp3 per line.
 *
 *   pnpm caller:generate --dry                          # list every line and its text
 *   pnpm caller:generate --only score-180,require-32
 *   pnpm caller:generate                                # everything not recorded yet
 *
 * Existing files are kept unless --force is passed, so re-recording one bad take is `--only <id> --force`.
 * The files are served as immutable, so changing a voice or a line for good means bumping CALLER_VERSION
 * here and in src/lib/caller.ts.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const CALLER_VERSION = "v1";
const VOICE_ID = "OpxYdhzUTqYdJ2tc6800"; // "Dart Announcer"
const MODEL_ID = "eleven_v4";
const OUT_DIR = join(import.meta.dirname, "..", "public", "caller", CALLER_VERSION);

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Numbers the way a British caller says them: "one hundred and forty-one". */
function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  return "one hundred" + (n > 100 ? ` and ${words(n - 100)}` : "");
}

/** Every total three darts can make: 163, 166, 169, 172, 173, 175, 176, 178 and 179 can't be scored. */
function possibleTotals(): number[] {
  const one = new Set([0, 25, 50]);
  for (let s = 1; s <= 20; s++) for (const m of [1, 2, 3]) one.add(s * m);
  const totals = new Set<number>();
  for (const a of one) for (const b of one) for (const c of one) totals.add(a + b + c);
  return [...totals].sort((x, y) => x - y);
}

type Line = { id: string; text: string; stability: number };

// Eleven v4 takes its direction from audio tags, capitals and punctuation. Lower stability gives the big
// calls room to soar; the everyday numbers stay steady so a session of them sounds like one caller.
function scoreLine(n: number): Line {
  const id = `score-${n}`;
  if (n === 0) return { id, text: "[flat, unimpressed] No score.", stability: 0.6 };
  if (n === 180) {
    return {
      id,
      text: "[shouting, ecstatic, drawn out like a stadium darts caller] ONE HUNDRED... AND EIGHTYYYYYYYYY!!!",
      stability: 0.2,
    };
  }
  if (n >= 140) return { id, text: `[very excited, booming] ${words(n).toUpperCase()}!`, stability: 0.3 };
  if (n >= 100) return { id, text: `[excited] ${words(n)}!`, stability: 0.4 };
  if (n >= 60) return { id, text: `[confident] ${words(n)}!`, stability: 0.5 };
  return { id, text: `[matter-of-fact] ${words(n)}.`, stability: 0.6 };
}

function requireLine(n: number): Line {
  const id = `require-${n}`;
  if (n === 170) return { id, text: "[building suspense] You require... ONE HUNDRED AND SEVENTY.", stability: 0.4 };
  if (n > 100) return { id, text: `[intrigued] You require ${words(n)}.`, stability: 0.5 };
  return { id, text: `[calm] You require ${words(n)}.`, stability: 0.6 };
}

const LINES: Line[] = [
  ...possibleTotals().map(scoreLine),
  // 1 is only a finish with single out, which ends on any dart, so it's not called.
  ...Array.from({ length: 169 }, (_, i) => requireLine(i + 2)),
  { id: "bust", text: "[disappointed] Bust!", stability: 0.5 },
  { id: "game-on", text: "[energetic] Game on!", stability: 0.5 },
  { id: "game-shot-leg", text: "[excited] Game shot... and the leg!", stability: 0.4 },
  { id: "game-shot-set", text: "[very excited] GAME SHOT... AND THE SET!", stability: 0.3 },
  { id: "game-shot-match", text: "[shouting, ecstatic] GAME SHOT... AND THE MATCH!!!", stability: 0.2 },
];

const exists = (path: string) => stat(path).then(() => true, () => false);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function record(client: ElevenLabsClient, line: Line, path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      const audio = await client.textToSpeech.convert(VOICE_ID, {
        text: line.text,
        modelId: MODEL_ID,
        languageCode: "en",
        outputFormat: "mp3_44100_64",
        voiceSettings: { stability: line.stability, similarityBoost: 0.8 },
      });
      await writeFile(path, Buffer.from(await new Response(audio).arrayBuffer()));
      return;
    } catch (e) {
      // Too many requests at once on smaller plans; back off and try again.
      const status = (e as { statusCode?: number }).statusCode;
      if (status !== 429 || attempt >= 5) throw e;
      await sleep(2000 * attempt);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const onlyAt = args.indexOf("--only");
  const only = onlyAt >= 0 ? new Set(args[onlyAt + 1]?.split(",")) : null;

  const lines = only ? LINES.filter((l) => only.has(l.id)) : LINES;
  if (only) for (const id of only) if (!LINES.some((l) => l.id === id)) throw new Error(`Unknown line "${id}"`);

  if (flag("--dry")) {
    for (const l of lines) console.log(`${l.id.padEnd(18)} ${l.stability.toFixed(1)}  ${l.text}`);
    const chars = lines.reduce((n, l) => n + l.text.length, 0);
    console.log(`\n${lines.length} lines, about ${chars} characters.`);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const todo: Line[] = [];
  for (const l of lines) if (flag("--force") || !(await exists(join(OUT_DIR, `${l.id}.mp3`)))) todo.push(l);
  console.log(`Recording ${todo.length} of ${lines.length} lines into ${OUT_DIR}`);

  const client = new ElevenLabsClient();
  let done = 0;
  const failed: string[] = [];
  // Two at a time stays inside the concurrency limit of every plan.
  const workers = Array.from({ length: 2 }, async () => {
    for (let l = todo.shift(); l; l = todo.shift()) {
      try {
        await record(client, l, join(OUT_DIR, `${l.id}.mp3`));
        console.log(`  ${++done}  ${l.id}`);
      } catch (e) {
        failed.push(l.id);
        console.error(`  failed ${l.id}: ${(e as Error).message}`);
      }
    }
  });
  await Promise.all(workers);
  if (failed.length) {
    console.error(`\n${failed.length} failed. Retry with --only ${failed.join(",")}`);
    process.exitCode = 1;
  }
}

await main();
