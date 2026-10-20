import { ImageResponse } from "next/og";
import { boardIconSvg } from "@/lib/board-geometry";

const SIZES = new Set([180, 192, 512]);

/** PNG app icons for the manifest and the iOS home screen, drawn from the same board geometry as the app. */
export async function GET(_: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const px = Number.parseInt(size, 10);
  if (!SIZES.has(px)) return new Response("Not found", { status: 404 });
  // Keep the board inside the maskable safe zone.
  const svg = Buffer.from(boardIconSvg(px, 0.18)).toString("base64");
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`data:image/svg+xml;base64,${svg}`} width={px} height={px} alt="" />,
    { width: px, height: px, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
