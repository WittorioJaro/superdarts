"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";

export function Avatar({
  name,
  color,
  url,
  size = 40,
}: {
  name: string;
  color: string;
  url?: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-bold text-ink"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42, boxShadow: `0 0 0 2px ${color}` }}
    >
      {initials}
      {url && (
        // Google avatars are tiny and already optimised.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

export function BackLink({ href = "/", label = "Home" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex h-11 items-center gap-1 rounded-xl px-2 text-dim transition hover:text-chalk"
    >
      <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span className="text-base font-medium">{label}</span>
    </Link>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-dim">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={`h-12 min-w-14 rounded-xl px-4 font-display text-xl font-semibold transition ${
                active ? "bg-chalk text-ink" : "bg-felt text-chalk hover:bg-wire"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Bottom sheet on narrow screens, centred card on wide ones. Escape and the backdrop close it. */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-chalk backdrop:bg-ink/75 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-xl"
    >
      <div className="safe-bottom rounded-t-3xl border border-wire bg-cabinet p-6 sm:rounded-3xl">{children}</div>
    </dialog>
  );
}
