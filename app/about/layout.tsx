import type { Metadata } from "next"

export const metadata: Metadata = {
  title:       "About BmbMusic — Free Music PWA",
  description: "BmbMusic is a free music streaming Progressive Web App (PWA) with synced lyrics, trending charts, radio stations, party mode, and more — powered by YouTube Music.",
  alternates:  { canonical: "https://BmbMusic.vercel.app/about" },
  openGraph: {
    title:       "About BmbMusic",
    description: "Free music streaming PWA with synced lyrics and trending charts.",
    url:         "https://BmbMusic.vercel.app/about",
  },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
