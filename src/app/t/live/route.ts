import { type NextRequest } from "next/server";
import { liveAccess, readLive, readLiveRev } from "@/lib/pub-table-live";

/**
 * Polled by both screens of a pub table. `?table=` is the host's phone; without it, the table's computer by cookie.
 * Passing the last `rev` seen skips the game when nothing has changed.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const access = await liveAccess(params.get("table") ?? undefined);
  if (!access) return Response.json({ error: "This table has been closed." }, { status: 410 });
  const known = Number(params.get("rev"));
  const rev = await readLiveRev(access.tableId);
  const body = params.has("rev") && known === rev ? { rev } : await readLive(access.tableId);
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
