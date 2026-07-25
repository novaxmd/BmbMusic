import type { Metadata } from "next"

export const metadata: Metadata = {
  title:       "Listening History & Stats",
  description: "See your complete listening history, top played songs of the day, week, and month, plus detailed listening stats and activity heatmap.",
  alternates:  { canonical: "https://BmbSong.vercel.app/history" },
  robots:      { index: false },   // personal data — don't index
  openGraph: {
    title:       "Your Listening History | BmbSong",
    description: "Top songs, listening stats, and your full play history.",
    url:         "https://BmbSong.vercel.app/history",
  },
}

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
