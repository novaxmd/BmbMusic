import type { Metadata } from "next"

export const metadata: Metadata = {
  title:       "Your Library — Saved Songs & Playlists",
  description: "Access your personal music library. View liked songs, downloaded tracks, and all your custom playlists in one place.",
  alternates:  { canonical: "https://BmbMusic.vercel.app/library" },
  openGraph: {
    title:       "Your Library | BmbMusic",
    description: "Your saved songs, playlists, and downloads all in one place.",
    url:         "https://BmbMusic.vercel.app/library",
  },
}

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
