"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions";
import { Sheet } from "@/components/ui";
import { PLAYER_COLORS } from "@/lib/colors";

export function EditProfile({ name: initialName, color: initialColor }: { name: string; color: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 rounded-xl bg-cabinet px-4 font-medium hover:bg-felt"
      >
        Edit profile
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Edit profile">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await updateProfile({ name, color });
              if (!res.ok) return setError(res.error);
              setError(null);
              setOpen(false);
            });
          }}
        >
          <h2 className="font-display text-3xl font-bold">Edit profile</h2>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-dim">Name on the scoreboard</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="h-14 rounded-xl border border-wire bg-ink px-4 text-xl outline-none focus:border-chalk"
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-dim">Colour</legend>
            <div className="flex flex-wrap gap-3">
              {PLAYER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={c === color}
                  onClick={() => setColor(c)}
                  className={`h-12 w-12 rounded-full transition ${c === color ? "ring-4 ring-chalk ring-offset-4 ring-offset-cabinet" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </fieldset>
          {error && <p className="text-double">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="h-14 rounded-xl bg-chalk font-display text-xl font-bold text-ink disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
