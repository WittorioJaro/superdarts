import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardMark } from "@/components/board-mark";
import { getCurrentPlayer } from "@/lib/auth";
import { getHostTableSession } from "@/lib/pub-tables";
import { Table } from "../../t/table";

export const metadata: Metadata = { title: "Score a pub table" };

/** The host's phone scoring a table that's open on the pub's computer. Both screens show the same game. */
export default async function HostScorePage({ params }: PageProps<"/table/[id]">) {
  const { id } = await params;
  const me = await getCurrentPlayer();
  const session = await getHostTableSession(id, me.id);
  if (!session) notFound();
  const { hostName, players, expiresAt } = session;
  return <Table key={id} session={{ id, hostName, players, expiresAt }} logo={<BoardMark size={36} />} hostTableId={id} />;
}
