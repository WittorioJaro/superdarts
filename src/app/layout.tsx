import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { FriendsProvider } from "@/components/friends";
import { MeProvider } from "@/components/me";
import { NoZoom } from "@/components/no-zoom";
import { getSignedInPlayer } from "@/lib/auth";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Superdarts",
  description: "Scoring, practice and stats for our darts nights.",
  applicationName: "Superdarts",
  appleWebApp: { capable: true, title: "Superdarts", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { icon: "/pwa-icon/192", apple: "/pwa-icon/180" },
};

export const viewport: Viewport = {
  themeColor: "#0c1713",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const signedIn = await getSignedInPlayer();
  const me = signedIn && { id: signedIn.id, name: signedIn.name, color: signedIn.color, avatarUrl: signedIn.avatarUrl };
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body>
        <div id="app" className="flex flex-col">
          {me ? (
            <MeProvider me={me}>
              <FriendsProvider me={me}>{children}</FriendsProvider>
            </MeProvider>
          ) : (
            children
          )}
        </div>
        <NoZoom />
      </body>
    </html>
  );
}
