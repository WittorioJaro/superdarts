import { BackLink } from "@/components/ui";

/** Shown the moment a link is tapped, while the server renders the page. */
export function PageSkeleton({ title, back = true }: { title?: string; back?: boolean }) {
  return (
    <main
      aria-busy
      aria-label="Loading"
      className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 sm:px-8"
    >
      <header className="flex flex-col gap-1 pt-2">
        {back ? <BackLink /> : <div className="h-11" />}
        {title ? (
          <h1 className="font-display text-5xl font-extrabold tracking-tight">{title}</h1>
        ) : (
          <div className="h-12 w-56 animate-pulse rounded-xl bg-cabinet" />
        )}
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-3xl bg-cabinet" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </main>
  );
}
