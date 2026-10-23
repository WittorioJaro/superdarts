import type { Metadata } from "next";
import { BoardMark } from "@/components/board-mark";
import { getTableSession } from "@/lib/pub-tables";
import { CodeEntry } from "./code-entry";
import { Table } from "./table";

export const metadata: Metadata = { title: "Superdarts table", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The pub's computer. No sign-in: a one-time code from a signed-in phone opens a table for the players it names. */
export default async function TablePage() {
  const session = await getTableSession();
  // The logo is drawn on the server: its trig rounds differently in the browser and would break hydration.
  const logo = <BoardMark size={session ? 36 : 112} />;
  if (!session) return <CodeEntry logo={logo} />;
  const { id, hostName, players, expiresAt } = session;
  return <Table key={id} session={{ id, hostName, players, expiresAt }} logo={logo} />;
}
