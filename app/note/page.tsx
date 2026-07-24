"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { X, Heart, Star, Sparkles, Music } from "lucide-react"

// ── Theme definitions ────────────────────────────────────────────────────────
const THEMES: Record<string, {
  label: string
  emoji: string
  bg: string
  card: string
  text: string
  accent: string
  particles: string[]
}> = {
  love: {
    label: "Love",
    emoji: "💕",
    bg: "from-rose-950 via-rose-900 to-pink-950",
    card: "bg-rose-900/60 border-rose-500/30",
    text: "text-rose-100",
    accent: "text-rose-300",
    particles: ["💕", "🌹", "❤️", "💗", "✨", "🌸"],
  },
  friendship: {
    label: "Friendship",
    emoji: "💛",
    bg: "from-amber-950 via-yellow-900 to-orange-950",
    card: "bg-amber-900/60 border-amber-500/30",
    text: "text-amber-100",
    accent: "text-amber-300",
    particles: ["💛", "🌻", "🤝", "⭐", "✨", "🌟"],
  },
  missing: {
    label: "Missing You",
    emoji: "🌙",
    bg: "from-indigo-950 via-blue-900 to-slate-950",
    card: "bg-indigo-900/60 border-indigo-500/30",
    text: "text-indigo-100",
    accent: "text-indigo-300",
    particles: ["🌙", "⭐", "💙", "🌌", "✨", "🌊"],
  },
  gratitude: {
    label: "Gratitude",
    emoji: "🙏",
    bg: "from-emerald-950 via-teal-900 to-green-950",
    card: "bg-emerald-900/60 border-emerald-500/30",
    text: "text-emerald-100",
    accent: "text-emerald-300",
    particles: ["🙏", "🌿", "💚", "🍃", "✨", "🌱"],
  },
  congrats: {
    label: "Congrats",
    emoji: "🎉",
    bg: "from-violet-950 via-purple-900 to-fuchsia-950",
    card: "bg-violet-900/60 border-violet-500/30",
    text: "text-violet-100",
    accent: "text-violet-300",
    particles: ["🎉", "🎊", "💜", "⭐", "✨", "🎈"],
  },
  just: {
    label: "Just Because",
    emoji: "✨",
    bg: "from-slate-950 via-zinc-900 to-neutral-950",
    card: "bg-slate-800/60 border-slate-500/30",
    text: "text-slate-100",
    accent: "text-slate-300",
    particles: ["✨", "💫", "🌟", "⚡", "🔮", "🌙"],
  },
}

// ── Floating particle ─────────────────────────────────────────────────────────
function Particle({ emoji, style }: { emoji: string; style: React.CSSProperties }) {
  return (
    <span
      className="fixed pointer-events-none select-none text-2xl animate-bounce"
      style={{ ...style, animationDuration: `${2 + Math.random() * 2}s` }}
    >
      {emoji}
    </span>
  )
}

// ── Main page wrapped in Suspense ─────────────────────────────────────────────
export default function NotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Music className="w-10 h-10 text-slate-400 mx-auto animate-pulse" />
          <p className="text-slate-400 text-sm">Loading your note…</p>
        </div>
      </div>
    }>
      <NoteInner />
    </Suspense>
  )
}

function NoteInner() {
  const params  = useSearchParams()
  const router  = useRouter()

  // Song params
  const videoId   = params.get("videoId") || params.get("id") || ""
  const songTitle = params.get("title")   || "Unknown"
  const artist    = params.get("artist")  || ""
  const thumbnail = params.get("thumbnail") || ""

  // Note params
  const triggerAt  = parseInt(params.get("t")   || "0", 10)
  const noteTitle  = params.get("nt")  || "A note for you"
  const noteMsg    = params.get("nm")  || ""
  const themeKey   = (params.get("nth") || "just") as keyof typeof THEMES
  const senderName = params.get("nf")  || ""
  const isSecretNote = params.get("sn") === "1"  // message starts blurred until revealed

  const theme = THEMES[themeKey] || THEMES.just

  // ── State ────────────────────────────────────────────────────────────────
  const [started,       setStarted]       = useState(false)   // user has tapped → gesture granted
  const [playerReady,   setPlayerReady]   = useState(false)
  const [currentTime,   setCurrentTime]   = useState(0)
  const [noteVisible,   setNoteVisible]   = useState(false)
  const [secretNoteRevealed, setSecretNoteRevealed] = useState(false)
  const [noteFullscreen,setNoteFullscreen]= useState(false)
  const [particles,     setParticles]     = useState<{ id: number; emoji: string; x: number; y: number }[]>([])
  const [hasTriggered,  setHasTriggered]  = useState(triggerAt === 0)

  const ytRef       = useRef<any>(null)
  const containerRef= useRef<HTMLDivElement>(null)
  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const triggeredRef= useRef(triggerAt === 0)

  // ── Load YouTube IFrame API ───────────────────────────────────────────────
  // Only runs after the user taps "Begin" — that tap IS the browser gesture
  // required for autoplay. Without it, playVideo() is silently blocked.
  useEffect(() => {
    if (!videoId || !started) return

    const initPlayer = () => {
      ytRef.current = new (window as any).YT.Player("yt-note-player", {
        videoId,
        playerVars: {
          autoplay:       1,
          controls:       0,
          disablekb:      1,
          fs:             0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel:            0,
          showinfo:       0,
          loop:           1,       // Loop single video
          playlist:       videoId, // Required for loop to work
        },
        events: {
          onReady: () => {
            setPlayerReady(true)
            ytRef.current?.playVideo()
            ytRef.current?.setVolume(80)
          },
          onStateChange: (e: any) => {
            // YT.PlayerState.ENDED = 0 — manually restart for belt-and-suspenders
            if (e.data === 0) {
              ytRef.current?.seekTo(0, true)
              ytRef.current?.playVideo()
            }
          },
        },
      })
    }

    if ((window as any).YT?.Player) {
      initPlayer()
    } else {
      const script = document.createElement("script")
      script.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(script)
      ;(window as any).onYouTubeIframeAPIReady = initPlayer
    }

    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      try { ytRef.current?.destroy() } catch {}
    }
  }, [videoId])

  // ── Tick: watch playback time → trigger note ──────────────────────────────
  useEffect(() => {
    if (!playerReady || !started) return
    tickRef.current = setInterval(() => {
      try {
        const ct = ytRef.current?.getCurrentTime?.() ?? 0
        setCurrentTime(Math.floor(ct))
        if (!triggeredRef.current && ct >= triggerAt) {
          triggeredRef.current = true
          setHasTriggered(true)
          setNoteVisible(true)
          // Small delay then go fullscreen
          setTimeout(() => setNoteFullscreen(true), 600)
          // Spawn particles
          spawnParticles()
        }
      } catch {}
    }, 500)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [playerReady, triggerAt])

  // ── Particle burst ────────────────────────────────────────────────────────
  const spawnParticles = () => {
    const burst = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      emoji: theme.particles[i % theme.particles.length],
      x: Math.random() * 90 + 5,
      y: Math.random() * 70 + 10,
    }))
    setParticles(burst)
    setTimeout(() => setParticles([]), 4000)
  }

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

  const timeLeft = Math.max(0, triggerAt - currentTime)

  return (
    <div className={`min-h-screen bg-gradient-to-br ${theme.bg} flex flex-col overflow-hidden`}>

      {/* YT player — offscreen but real dimensions so onReady fires properly */}
      {started && (
        <div
          style={{ position: "fixed", left: "-9999px", top: "-9999px", width: "1px", height: "1px", overflow: "hidden", opacity: 0, pointerEvents: "none" }}
          aria-hidden="true"
        >
          <div id="yt-note-player" style={{ width: "1px", height: "1px" }} />
        </div>
      )}

      {/* Floating particles */}
      {particles.map(p => (
        <Particle
          key={p.id}
          emoji={p.emoji}
          style={{ left: `${p.x}vw`, top: `${p.y}vh`, opacity: 0.8 }}
        />
      ))}

      {/* ══════════════════════════════════════════════════════════════════
          TAP-TO-START GATE
          Browsers block autoplay without a prior user gesture.
          This screen IS that gesture — one tap unlocks everything.
      ══════════════════════════════════════════════════════════════════ */}
      {!started ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 text-center">
          {/* Song thumbnail */}
          <div className="relative">
            <div className="w-32 h-32 rounded-3xl overflow-hidden shadow-2xl ring-4 ring-white/10">
              {thumbnail
                ? <img src={thumbnail} alt={songTitle} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-black/30 flex items-center justify-center"><Music className="w-10 h-10 text-white/40" /></div>
              }
            </div>
            <div className="absolute -bottom-3 -right-3 w-10 h-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-2xl shadow-lg">
              {theme.emoji}
            </div>
          </div>

          {/* Song info */}
          <div className="space-y-1">
            <p className={`text-xl font-bold truncate max-w-xs ${theme.text}`}>{songTitle}</p>
            <p className={`text-sm ${theme.accent}`}>{artist}</p>
          </div>

          {/* Who sent it */}
          <div className="space-y-1">
            <p className={`text-2xl font-bold ${theme.text}`}>
              {senderName ? `${senderName} sent you a note` : "Someone sent you a note"}
            </p>
            <p className={`text-sm ${theme.accent} opacity-80`}>
              {triggerAt > 0
                ? `It will appear at ${fmtTime(triggerAt)} into the song`
                : "It will appear as soon as the song starts"}
            </p>
          </div>

          {/* THE gesture button */}
          <button
            onClick={() => setStarted(true)}
            className={[
              "flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg shadow-2xl",
              "active:scale-95 transition-all duration-150",
              "bg-white/20 backdrop-blur border border-white/30 text-white",
              "hover:bg-white/30",
            ].join(" ")}
          >
            <span className="text-2xl">▶</span>
            Tap to begin
          </button>

          <p className="text-white/30 text-xs">Music will play while you wait</p>
        </div>

      ) : (
        <>
          {/* ── Song info header (shown after start) ─────────────────── */}
          <div className="flex items-center gap-4 p-5 pt-safe">
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black/30 flex-shrink-0 shadow-xl">
              {thumbnail
                ? <img src={thumbnail} alt={songTitle} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><Music className="w-6 h-6 text-white/40" /></div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-base truncate ${theme.text}`}>{songTitle}</p>
              <p className={`text-sm truncate ${theme.accent}`}>{artist}</p>
              <p className="text-xs text-white/40 mt-0.5">
                {playerReady ? "🔁 Playing on repeat" : "Starting…"}
              </p>
            </div>
            <button
              onClick={() => router.push(`/player?id=${videoId}&title=${encodeURIComponent(songTitle)}&artist=${encodeURIComponent(artist)}&thumbnail=${encodeURIComponent(thumbnail)}&type=musiva&videoId=${videoId}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs font-medium transition-colors flex-shrink-0"
              title="Get message"
            >
              <Music className="w-3.5 h-3.5" />
              Get message
            </button>
          </div>

          {/* ── Waiting state — note hasn't triggered yet ────────────── */}
          {!hasTriggered && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-5xl shadow-2xl animate-pulse">
                  {theme.emoji}
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-lg">✉️</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className={`text-2xl font-bold ${theme.text}`}>
                  {senderName ? `${senderName} left you a note` : "Someone left you a note"}
                </p>
                <p className={`text-sm ${theme.accent}`}>
                  {triggerAt > 0
                    ? `It will appear at ${fmtTime(triggerAt)} into the song`
                    : "It's about to appear…"}
                </p>
              </div>

              {/* Countdown */}
              {timeLeft > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-white/40 text-xs uppercase tracking-widest">Appears in</p>
                  <p className={`text-5xl font-bold tabular-nums ${theme.text}`}>
                    {fmtTime(timeLeft)}
                  </p>
                </div>
              )}

              <div className="flex gap-1 mt-2">
                {[...Array(5)].map((_, i) => (
                  <span
                    key={i}
                    className={`w-2 h-2 rounded-full ${theme.accent.replace("text-", "bg-")} animate-bounce opacity-60`}
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

      {/* ── Note overlay — slides up from bottom ───────────────────────── */}
      {noteVisible && (
        <div
          className={[
            "fixed inset-0 z-50 flex flex-col transition-all duration-700 ease-out",
            `bg-gradient-to-br ${theme.bg}`,
            noteFullscreen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full",
          ].join(" ")}
        >
          {/* Close button */}
          <div className="flex justify-end p-5 pt-safe">
            <button
              onClick={() => { setNoteVisible(false); setNoteFullscreen(false) }}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Note card */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 gap-8">

            {/* Theme emoji + sender */}
            <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
              <div className="text-6xl">{theme.emoji}</div>
              {senderName && (
                <p className={`text-sm font-medium ${theme.accent}`}>
                  from {senderName}
                </p>
              )}
            </div>

            {/* Note card body */}
            <div
              className={[
                "w-full max-w-sm rounded-3xl border p-6 shadow-2xl backdrop-blur-xl",
                "animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300",
                theme.card,
              ].join(" ")}
            >
              {/* Note title */}
              <h2 className={`text-2xl font-bold mb-4 text-center ${theme.text}`}>
                {noteTitle}
              </h2>

              {/* Divider */}
              <div className={`w-12 h-0.5 mx-auto mb-4 rounded-full ${theme.accent.replace("text-", "bg-")} opacity-50`} />

              {/* Note message — blurred until revealed if secret note */}
              {noteMsg && (
                isSecretNote && !secretNoteRevealed ? (
                  <div className="space-y-3">
                    <p
                      className={`text-base leading-relaxed text-center opacity-90 whitespace-pre-wrap select-none ${theme.text}`}
                      style={{ filter: "blur(7px)", userSelect: "none" }}
                    >
                      {noteMsg}
                    </p>
                    <button
                      onClick={() => setSecretNoteRevealed(true)}
                      className="w-full h-10 rounded-2xl bg-white/20 border border-white/30 text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                      💫 Reveal message
                    </button>
                  </div>
                ) : (
                  <p className={`text-base leading-relaxed text-center ${theme.text} opacity-90 whitespace-pre-wrap ${isSecretNote ? "animate-in fade-in zoom-in-95 duration-500" : ""}`}>
                    {noteMsg}
                  </p>
                )
              )}
            </div>

            {/* Song context */}
            <div
              className="flex items-center gap-3 animate-in fade-in duration-700 delay-500"
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/30 flex-shrink-0">
                {thumbnail
                  ? <img src={thumbnail} alt={songTitle} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/40" /></div>
                }
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${theme.text}`}>{songTitle}</p>
                <p className={`text-xs truncate ${theme.accent}`}>{artist} · {fmtTime(triggerAt)}</p>
              </div>
              <span className="text-white/40 text-xs ml-1">🔁</span>
            </div>

            {/* Hint */}
            <p className="text-white/30 text-xs text-center animate-in fade-in duration-700 delay-700">
              Music keeps playing. Tap × to dismiss.
            </p>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
