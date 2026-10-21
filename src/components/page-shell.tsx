import type { ReactNode } from "react";
import { BackLink } from "@/components/ui";

/** The frame most pages share: back link, big title, optional line under it. Pages and their loading states both use it. */
export function PageShell({
  title,
  subtitle,
  aside,
  gap = "gap-6",
  busy = false,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shown at the right of the title, wrapping below it on narrow screens. */
  aside?: ReactNode;
  gap?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      aria-busy={busy || undefined}
      className={`safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col ${gap} px-5 pb-10 sm:px-8`}
    >
      <header className={aside ? "flex flex-wrap items-end justify-between gap-4 pt-2" : "flex flex-col gap-1 pt-2"}>
        <div className="flex flex-col gap-1">
          <BackLink />
          <h1 className="font-display text-5xl font-extrabold tracking-tight">{title}</h1>
          {subtitle}
        </div>
        {aside}
      </header>
      {children}
    </main>
  );
}
