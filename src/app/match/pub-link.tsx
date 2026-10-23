import Link from "next/link";

/** Shared with loading.tsx, so the title row doesn't shift when the page arrives. */
export function PubTableLink() {
  return (
    <Link href="/table" className="flex h-12 items-center rounded-xl bg-cabinet px-4 font-semibold transition hover:bg-felt">
      Score on the pub&apos;s computer
    </Link>
  );
}
