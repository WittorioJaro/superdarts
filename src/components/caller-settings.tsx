"use client";

import { useState } from "react";
import { say, setCallerSettings, useCallerSettings } from "@/lib/caller";
import { Segmented, Sheet } from "./ui";

export function SpeakerIcon({ on, size = 22 }: { on: boolean; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {on ? <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="m16 9.5 5 5m0-5-5 5" />}
    </svg>
  );
}

/** The caller's switch and volume. Settings belong to this device, so every game and table on it shares them. */
export function CallerControls() {
  const { on, volume } = useCallerSettings();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-3xl font-bold">Caller</h2>
        <p className="mt-1 text-dim">Calls every visit out loud, like at the oche. Plays with your phone on silent.</p>
      </div>
      <Segmented
        label="Calls"
        value={on ? "on" : "off"}
        options={[
          { value: "on", label: "On" },
          { value: "off", label: "Off" },
        ]}
        onChange={(v) => setCallerSettings({ on: v === "on" })}
      />
      <label className={`flex flex-col gap-3 ${on ? "" : "opacity-40"}`}>
        <span className="flex justify-between text-sm font-medium text-dim">
          <span>Volume</span>
          <span className="tabular-nums">{Math.round(volume * 100)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          disabled={!on}
          onChange={(e) => setCallerSettings({ volume: Number(e.target.value) / 100 })}
          // Letting go plays a sample, so the level can be judged without starting a game.
          onPointerUp={() => say(["score-100"])}
          onKeyUp={(e) => e.key.startsWith("Arrow") && say(["score-100"])}
          className="h-8 w-full accent-[var(--color-brass)]"
        />
      </label>
      <button
        type="button"
        disabled={!on}
        onClick={() => say(["score-180"])}
        className="h-14 rounded-2xl bg-felt px-6 text-lg font-semibold hover:bg-wire disabled:opacity-40"
      >
        Play a 180
      </button>
    </div>
  );
}

/** A button that opens the caller settings in a sheet. */
export function CallerButton({ className, label }: { className: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const { on } = useCallerSettings();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ? undefined : on ? "Caller on" : "Caller off"}
        className={`${className} ${on ? "" : "text-dim"}`}
      >
        <SpeakerIcon on={on} />
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Caller settings">
        <CallerControls />
        <button type="button" onClick={() => setOpen(false)} className="mt-4 h-12 w-full rounded-xl font-medium text-dim hover:text-chalk">
          Done
        </button>
      </Sheet>
    </>
  );
}
