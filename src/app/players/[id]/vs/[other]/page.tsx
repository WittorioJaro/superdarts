import { notFound } from "next/navigation";
import { RecentGames } from "@/components/recent-games";
import { Avatar, BackLink } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { fmtAvg, fmtPct } from "@/lib/darts/stats";
import { getPlayer, headToHead } from "@/lib/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HeadToHeadPage({ params }: PageProps<"/players/[id]/vs/[other]">) {
  const { id, other } = await params;
  if (!UUID.test(id) || !UUID.test(other) || id === other) notFound();
  const [, a, b, h] = await Promise.all([getCurrentPlayer(), getPlayer(id), getPlayer(other), headToHead(id, other)]);
  if (!a || !b) notFound();

  const leader = h.streak ? (h.streak.playerId === a.id ? a : b) : null;
  const rows: { label: string; a: string; b: string; better: "higher" | "lower" | null; av: number; bv: number }[] = [
    { label: "Average", a: fmtAvg(h.a.average), b: fmtAvg(h.b.average), better: "higher", av: h.a.average ?? 0, bv: h.b.average ?? 0 },
    {
      label: "Checkout rate",
      a: h.a.checkoutPct !== null ? fmtPct(h.a.checkoutPct) : "–",
      b: h.b.checkoutPct !== null ? fmtPct(h.b.checkoutPct) : "–",
      better: "higher",
      av: h.a.checkoutPct ?? 0,
      bv: h.b.checkoutPct ?? 0,
    },
    { label: "Highest checkout", a: String(h.a.highestCheckout || "–"), b: String(h.b.highestCheckout || "–"), better: "higher", av: h.a.highestCheckout, bv: h.b.highestCheckout },
    { label: "180s", a: String(h.a.n180), b: String(h.b.n180), better: "higher", av: h.a.n180, bv: h.b.n180 },
  ];

  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-5 pb-10 sm:px-8">
      <header className="flex flex-col gap-4 pt-2">
        <BackLink href="/players" label="Players" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Side player={a} wins={h.winsA} />
          <span className="font-display text-3xl font-bold text-dim">vs</span>
          <Side player={b} wins={h.winsB} right />
        </div>
        <p className="text-center text-lg text-dim">
          {h.matches === 0
            ? "No matches between you yet."
            : `${h.matches} ${h.matches === 1 ? "match" : "matches"}${leader && h.streak ? `. ${leader.name.split(" ")[0]} has won the last ${h.streak.count}` : ""}.`}
        </p>
      </header>

      {h.matches > 0 && (
        <section aria-label="Side by side" className="rounded-3xl bg-cabinet p-5 sm:p-6">
          <dl className="flex flex-col divide-y divide-wire">
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-3">
                <dd className={`font-display text-4xl font-bold ${r.av > r.bv ? "text-brass" : ""}`}>{r.a}</dd>
                <dt className="text-center text-dim">{r.label}</dt>
                <dd className={`text-right font-display text-4xl font-bold ${r.bv > r.av ? "text-brass" : ""}`}>{r.b}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {h.games.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-3xl font-bold">Matches</h2>
          <RecentGames games={h.games} me={a.id} />
        </section>
      )}
    </main>
  );
}

function Side({ player, wins, right }: { player: { name: string; color: string; avatarUrl: string | null }; wins: number; right?: boolean }) {
  return (
    <div className={`flex items-center gap-4 ${right ? "flex-row-reverse text-right" : ""}`}>
      <Avatar name={player.name} color={player.color} url={player.avatarUrl} size={64} />
      <div className="min-w-0">
        <div className="truncate text-xl font-semibold">{player.name}</div>
        <div className="font-display text-7xl leading-none font-extrabold">{wins}</div>
      </div>
    </div>
  );
}
