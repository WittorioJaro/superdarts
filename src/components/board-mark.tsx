import { boardIconSvg } from "@/lib/board-geometry";

/** The dartboard logo, rendered inline from the same geometry as the app icon. */
export function BoardMark({ size = 40, className }: { size?: number; className?: string }) {
  const svg = boardIconSvg(200, 0.02).replace(/<rect[^>]*\/>/, "");
  return (
    <span
      aria-hidden
      className={className}
      style={{ width: size, height: size, display: "inline-block" }}
      dangerouslySetInnerHTML={{ __html: svg.replace('width="200" height="200"', 'width="100%" height="100%"') }}
    />
  );
}
