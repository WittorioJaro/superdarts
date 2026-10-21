import type { Metadata } from "next";
import { BoardMark } from "@/components/board-mark";
import { CameraClient } from "./camera-client";

export const metadata: Metadata = { title: "Superdarts camera" };

/** Opened on a phone from the QR code in a room. No sign-in: the link itself is the pass. */
export default async function CameraPage({ params }: PageProps<"/cam/[token]">) {
  const { token } = await params;
  // The logo is drawn on the server: its trig rounds differently in the browser and would break hydration.
  return <CameraClient token={token} logo={<BoardMark size={72} />} />;
}
