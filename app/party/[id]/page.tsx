"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Search, Music, Plus, Loader2, Users, Check, MessageCircle,
  Send, ThumbsUp, Reply, Trash2, X, UserX, ListMusic,
  Play, SkipForward, ShieldX, ShieldCheck,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getGuestId, getPartyUsername } from "@/lib/storage"
import { useAudio } from "@/lib/audio-context"
import type { Song } from "@/lib/types"

const PARTY_SERVER = process.env.NEXT_PUBLIC_PARTY_SERVER || "https://y-brown-two.vercel.app"
const EMOJIS = ["🔥", "❤️", "😍", "🎵", "💃", "🙌", "🎉", "😮"]

// ── Types matching the external Party API schema ───────────────────────────
interface QueueItem {
  id:        string
  title:     string
  artist:    string
  thumbnail: string
  type:      string
  videoId?:  string
  duration?: string
  addedBy:   string        // guestName from external API
  addedById: string | null
  addedAt:   number
  upvotes:   number
  downvotes: number
}

interface ReplyRef { id: string; name: string; msg: string }
interface ChatMsg  { id: string; name: string; guestId: string | null; msg: string; at: number; replyTo?: ReplyRef }
interface GuestInfo { id: string; name: string; joinedAt: number }

// ── Animated Equalizer ──────────────────────────────────────────────────────
function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="flex items-end gap-[2px] h-4">
      {[1, 2, 3].map(i => (
        <span
          key={i}
          className={[
            "w-[3px] rounded-full bg-primary origin-bottom",
            playing ? "animate-bounce" : "",
          ].join(" ")}
          style={{
            height:         playing ? `${8 + i * 4}px` : "4px",
            animationDelay: `${i * 80}ms`,
            transition:     "height 0.3s",
          }}
        />
      ))}
    </span>
  )
}

// ── Quoted reply block ───────────────────────────────────────────────────────
function ReplyBlock({ reply, own }: { reply: ReplyRef; own: boolean }) {
  return (
    <div className={[
      "text-[10px] rounded-lg px-2 py-1 mb-1 border-l-2 opacity-80",
      own
        ? "border-primary-foreground/60 bg-primary-foreground/10 text-primary-foreground"
        : "border-primary/60 bg-primary/10 text-foreground",
    ].join(" ")}>
      <span className="font-bold">{reply.name}: </span>{reply.msg}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function getHostSecretId(partyId: string): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem(`musicanaz_party_host_${partyId}`) || null } catch { return null }
}

export default function PartyGuestPage() {
  const { id }             = useParams()
  const router             = useRouter()
  const { playSong }       = useAudio()
  const partyId            = typeof id === "string" ? id : ""
  const guestId            = getGuestId()
  const username           = getPartyUsername()
  const hostSecretId       = getHostSecretId(partyId)   // non-null iff this user is host
  const isHost             = !!hostSecretId

  // ── Core state ────────────────────────────────────────────────────────────
  const [queue,         setQueue]         = useState<QueueItem[]>([])
  const [currentSong,   setCurrentSong]   = useState<Song | null>(null)
  const [guests,        setGuests]        = useState<GuestInfo[]>([])
  const [kickedGuests,  setKickedGuests]  = useState<string[]>([])
  const [chat,          setChat]          = useState<ChatMsg[]>([])
  const [chatInput,     setChatInput]     = useState("")
  const [replyTo,       setReplyTo]       = useState<ReplyRef | null>(null)
  // Track which songs THIS user has upvoted (votedBy is stripped in public state)
  const [votedSongs,    setVotedSongs]    = useState<Set<string>>(new Set())
  const [query,         setQuery]         = useState("")
  const [results,       setResults]       = useState<Song[]>([])
  const [searching,     setSearching]     = useState(false)
  const [addedIds,      setAddedIds]      = useState<Set<string>>(new Set())
  const [dupIds,        setDupIds]        = useState<Set<string>>(new Set())
  const [kicked,        setKicked]        = useState(false)
  const [reactions,     setReactions]     = useState<{ emoji: string; id: number; fromOther?: boolean }[]>([])
  const [activeTab,     setActiveTab]     = useState<"search" | "queue" | "chat" | "members">("search")

  const lastReactionTsRef = useRef<number>(0)
  const chatEndRef        = useRef<HTMLDivElement>(null)
  const pollRef           = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Queue sorted by net score (upvotes - downvotes) ───────────────────────
  const sortedQueue = [...queue].sort((a, b) => {
    const scoreA = (a.upvotes || 0) - (a.downvotes || 0)
    const scoreB = (b.upvotes || 0) - (b.downvotes || 0)
    if (scoreB !== scoreA) return scoreB - scoreA
    return (a.addedAt || 0) - (b.addedAt || 0)
  })

  // ── Poll full party state from external server ─────────────────────────────
  const poll = useCallback(async () => {
    if (!partyId || !PARTY_SERVER) return
    try {
      const res = await fetch(`${PARTY_SERVER}/party/${partyId}`)
      if (!res.ok) {
        if (res.status === 404) router.push("/")
        return
      }
      const data = await res.json()
      setQueue(data.queue       || [])
      setCurrentSong(data.currentSong || null)
      setGuests(data.guests     || [])
      setKickedGuests(data.kickedGuests || [])
      setChat(data.chat         || [])

      // Detect incoming reactions from other users
      if (Array.isArray(data.reactions) && data.reactions.length > 0) {
        const newRemote = data.reactions.filter(
          (r: any) => r.at > lastReactionTsRef.current && r.guestId !== guestId
        )
        if (newRemote.length > 0) {
          lastReactionTsRef.current = Math.max(...data.reactions.map((r: any) => r.at))
          newRemote.forEach((r: any) => {
            const rid = Date.now() * 1000 + (Math.random() * 1000 | 0)
            setReactions(prev => [...prev, { emoji: r.emoji, id: rid, fromOther: true }])
            setTimeout(() => setReactions(prev => prev.filter(x => x.id !== rid)), 2500)
          })
        } else if (lastReactionTsRef.current === 0) {
          lastReactionTsRef.current = Math.max(...data.reactions.map((r: any) => r.at))
        }
      }

      // Kicked check
      if (Array.isArray(data.kickedGuests) && data.kickedGuests.includes(guestId)) {
        setKicked(true)
      }
    } catch {}
  }, [partyId, guestId, router])

  // ── Join party on mount; start polling; leave on unmount ──────────────────
  useEffect(() => {
    if (!partyId || !PARTY_SERVER) return

    fetch(`${PARTY_SERVER}/party/${partyId}/join`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ guestName: username, guestId }),
    })
      .then(r => {
        if (r.status === 403) { setKicked(true); return null }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (!data) return
        setQueue(data.queue       || [])
        setCurrentSong(data.currentSong || null)
        setGuests(data.guests     || [])
      })
      .catch(() => {})

    poll()
    pollRef.current = setInterval(poll, 3000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      // Leave party gracefully
      navigator.sendBeacon
        ? navigator.sendBeacon(
            `${PARTY_SERVER}/party/${partyId}/leave`,
            JSON.stringify({ guestId })
          )
        : fetch(`${PARTY_SERVER}/party/${partyId}/leave`, {
            method:    "POST",
            headers:   { "Content-Type": "application/json" },
            body:      JSON.stringify({ guestId }),
            keepalive: true,
          }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId])

  // Redirect if kicked
  useEffect(() => {
    if (kicked) {
      const t = setTimeout(() => router.push("/"), 2500)
      return () => clearTimeout(t)
    }
  }, [kicked, router])

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat])

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const res  = await fetch(`/api/musiva/search?q=${encodeURIComponent(query)}&filter=songs&limit=20`)
      const data = await res.json()
      const songs = (data.results || []).map((t: any): Song => ({
        id:        t.videoId || t.id,
        title:     t.title,
        artist:    Array.isArray(t.artists)
          ? t.artists.map((a: any) => typeof a === "string" ? a : a?.name ?? "").join(", ")
          : (t.artist || "Unknown"),
        thumbnail: t.thumbnail || t.thumbnails?.[0]?.url || "",
        type:      "musiva",
        videoId:   t.videoId || t.id,
        duration:  t.duration || "",
      }))
      setResults(songs)
    } catch {}
    setSearching(false)
  }

  // ── Add song to party queue ───────────────────────────────────────────────
  const addSong = async (song: Song) => {
    if (!PARTY_SERVER) return
    try {
      const res = await fetch(`${PARTY_SERVER}/party/${partyId}/queue`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ song, guestName: username, guestId }),
      })
      if (res.status === 409) {
        setDupIds(prev => new Set(prev).add(song.id))
        setTimeout(() => setDupIds(prev => { const n = new Set(prev); n.delete(song.id); return n }), 2500)
        return
      }
      if (!res.ok) return
      const data = await res.json()
      if (data.queue) setQueue(data.queue)
      setAddedIds(prev => new Set(prev).add(song.id))
      setTimeout(() => setAddedIds(prev => { const n = new Set(prev); n.delete(song.id); return n }), 2500)
    } catch {}
  }

  // ── Vote (toggle upvote) ──────────────────────────────────────────────────
  const voteSong = async (songId: string) => {
    if (!PARTY_SERVER) return
    const alreadyVoted = votedSongs.has(songId)
    const vote         = alreadyVoted ? null : "up"   // null = remove vote

    // Optimistic UI update
    setVotedSongs(prev => {
      const n = new Set(prev)
      alreadyVoted ? n.delete(songId) : n.add(songId)
      return n
    })
    setQueue(prev => prev.map(s =>
      s.id === songId
        ? { ...s, upvotes: alreadyVoted ? Math.max(0, s.upvotes - 1) : s.upvotes + 1 }
        : s
    ))

    try {
      const res = await fetch(`${PARTY_SERVER}/party/${partyId}/vote`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ songId, guestId, vote }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.queue) setQueue(data.queue)
      }
    } catch {}
  }

  // ── Remove song from queue (host only) ────────────────────────────────────
  const removeSong = async (songId: string) => {
    if (!PARTY_SERVER || !hostSecretId) return
    try {
      const res = await fetch(
        `${PARTY_SERVER}/party/${partyId}/queue/${songId}?hostId=${hostSecretId}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        const data = await res.json()
        if (data.queue) setQueue(data.queue)
      }
    } catch {}
  }

  // ── Pop queue — mark top song as played, advance queue (host only) ─────────
  const popQueue = async () => {
    if (!PARTY_SERVER || !hostSecretId) return
    try {
      const res = await fetch(`${PARTY_SERVER}/party/${partyId}/queue/pop`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ hostId: hostSecretId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.queue) setQueue(data.queue)
      }
    } catch {}
  }

  // ── Send chat message (with optimistic update) ─────────────────────────────
  const sendChat = async () => {
    const msg = chatInput.trim()
    if (!msg || !PARTY_SERVER) return

    // Show message immediately — don't wait for server round-trip
    const optimistic: ChatMsg = {
      id:      `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name:    username,
      guestId: guestId,
      msg,
      at:      Date.now(),
      replyTo: replyTo ?? undefined,
    }
    setChat(prev => [...prev, optimistic])
    setChatInput("")
    setReplyTo(null)

    try {
      const res = await fetch(`${PARTY_SERVER}/party/${partyId}/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    username,
          guestId: guestId,
          msg,
          replyTo: replyTo ?? undefined,
        }),
      })
      if (res.ok) await poll()   // replace optimistic msg with server-confirmed one
    } catch {}
  }

  // ── Delete chat message ───────────────────────────────────────────────────
  const deleteMessage = async (msgId: string, msgGuestId: string | null) => {
    if (!PARTY_SERVER) return
    // Optimistic remove
    setChat(prev => prev.filter(m => m.id !== msgId))
    try {
      const params = isHost
        ? `hostId=${hostSecretId}`
        : `guestId=${guestId}`
      await fetch(
        `${PARTY_SERVER}/party/${partyId}/chat/${msgId}?${params}`,
        { method: "DELETE" }
      )
    } catch {}
  }

  // ── Emoji reactions ───────────────────────────────────────────────────────
  const sendReaction = async (emoji: string) => {
    const rid = Date.now()
    setReactions(prev => [...prev, { emoji, id: rid }])
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 2500)
    if (!PARTY_SERVER) return
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}/react`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ emoji, name: username, guestId }),
      })
    } catch {}
  }

  // ── Kick / Unkick guest (host only) ───────────────────────────────────────
  const kickGuest = async (targetGuestId: string) => {
    if (!PARTY_SERVER || !hostSecretId) return
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}/kick`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ hostId: hostSecretId, guestId: targetGuestId }),
      })
      await poll()
    } catch {}
  }

  const unkickGuest = async (targetGuestId: string) => {
    if (!PARTY_SERVER || !hostSecretId) return
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}/unkick`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ hostId: hostSecretId, guestId: targetGuestId }),
      })
      await poll()
    } catch {}
  }

  // ── Kicked screen ─────────────────────────────────────────────────────────
  if (kicked) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <UserX className="w-16 h-16 mx-auto text-destructive" />
          <h2 className="text-2xl font-bold">You've been removed</h2>
          <p className="text-muted-foreground">The host has removed you from this party.</p>
          <p className="text-xs text-muted-foreground">Redirecting…</p>
        </div>
      </div>
    )
  }

  const tabs = (["search", "queue", "chat", ...(isHost ? ["members"] : [])] as const)

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background">

      {/* Floating emoji reactions */}
      <div className="fixed bottom-32 right-4 z-50 flex flex-col gap-1 pointer-events-none">
        {reactions.map(r => (
          <div
            key={r.id}
            className={[
              "text-2xl animate-in slide-in-from-bottom-4 fade-in duration-300 text-center",
              r.fromOther ? "opacity-70" : "",
            ].join(" ")}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      <div className="container mx-auto px-4 py-6 max-w-2xl">

        {/* ── Header ── */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                Party Mode
                {isHost && (
                  <span className="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                    Host
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                ID: {partyId} · {username} · {guests.length} guest{guests.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="rounded-full gap-2">
            <Music className="w-4 h-4" /> App
          </Button>
        </header>

        {/* ── Now Playing card ── */}
        {currentSong && (
          <div className="bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl p-4 mb-5 shadow flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
              <img src={currentSong.thumbnail} alt={currentSong.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">
                Now Playing
              </p>
              <p className="font-bold text-sm truncate">{currentSong.title}</p>
              <p className="text-xs text-muted-foreground truncate">{currentSong.artist}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Equalizer playing={true} />
              {/* Play on this device — available to ALL guests */}
              <Button
                size="sm"
                variant="secondary"
                className="rounded-full text-xs h-7 px-3 gap-1.5"
                onClick={() => playSong(currentSong, true)}
                title="Play on this device"
              >
                <Play className="w-3 h-3 fill-current" />
                Play
              </Button>
              {/* Host only: advance queue */}
              {isHost && sortedQueue.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full h-7 w-7 text-muted-foreground hover:text-primary"
                  onClick={popQueue}
                  title="Mark played & advance queue"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Emoji reactions bar ── */}
        <div className="flex gap-2 justify-center mb-5 flex-wrap">
          {EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => sendReaction(e)}
              className="text-xl p-2 rounded-full bg-card/50 hover:bg-card/80 hover:scale-110 transition-all active:scale-95"
            >
              {e}
            </button>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-card/40 rounded-2xl p-1 mb-5 border border-border/30 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={[
                "flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all whitespace-nowrap px-2",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab === "chat"    && `💬 Chat${chat.length ? ` (${chat.length})` : ""}`}
              {tab === "queue"   && `🎵 Queue${sortedQueue.length ? ` (${sortedQueue.length})` : ""}`}
              {tab === "search"  && "🔍 Search"}
              {tab === "members" && `👥 Members${guests.length ? ` (${guests.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* ════════ Search Tab ════════ */}
        {activeTab === "search" && (
          <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-3xl p-5 shadow-xl">
            <form onSubmit={handleSearch} className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search for songs…"
                className="pl-11 h-11 rounded-2xl bg-background/50 border-border/50"
              />
              {searching && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
              )}
            </form>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {results.map(song => (
                <div
                  key={song.id}
                  className="flex items-center gap-3 p-2 rounded-2xl hover:bg-primary/5 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                    <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{song.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                  </div>
                  <Button
                    size="icon"
                    variant={
                      addedIds.has(song.id) ? "default"
                        : dupIds.has(song.id) ? "destructive"
                        : "secondary"
                    }
                    className="rounded-full flex-shrink-0 w-8 h-8"
                    onClick={() => addSong(song)}
                    disabled={addedIds.has(song.id) || dupIds.has(song.id)}
                  >
                    {addedIds.has(song.id) ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : dupIds.has(song.id) ? (
                      <X className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              ))}
              {results.length === 0 && !searching && (
                <div className="text-center py-10 text-muted-foreground opacity-50">
                  <Music className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">Search for your favourite tracks</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════ Queue Tab ════════ */}
        {activeTab === "queue" && (
          <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-3xl p-5 shadow-xl">
            <h2 className="font-semibold mb-4 text-sm text-muted-foreground flex items-center gap-2">
              <ListMusic className="w-4 h-4" />
              Party Queue — vote to reorder
            </h2>
            {sortedQueue.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground opacity-50">
                <Music className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">No songs yet — search and add some!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedQueue.map((song, i) => {
                  const net      = (song.upvotes || 0) - (song.downvotes || 0)
                  const hasVoted = votedSongs.has(song.id)
                  return (
                    <div
                      key={song.id}
                      className="flex items-center gap-3 p-2 rounded-2xl bg-card/40"
                    >
                      <span className="text-xs text-muted-foreground w-5 text-center font-mono">
                        {i + 1}
                      </span>
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                        <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{song.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {song.artist}
                          {song.addedBy && (
                            <span className="ml-1 text-primary/70">· by {song.addedBy}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => voteSong(song.id)}
                          className={[
                            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all",
                            hasVoted
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary",
                          ].join(" ")}
                          title={hasVoted ? "Remove vote" : "Upvote"}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          {net > 0 ? `+${net}` : net}
                        </button>
                        {isHost && (
                          <button
                            onClick={() => removeSong(song.id)}
                            className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════ Chat Tab ════════ */}
        {activeTab === "chat" && (
          <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-3xl p-5 shadow-xl">
            <div className="h-[50vh] overflow-y-auto space-y-2 mb-4 pr-1">
              {chat.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground opacity-50">
                  <MessageCircle className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">No messages yet</p>
                </div>
              ) : (
                chat.map(msg => {
                  const isOwn     = msg.guestId === guestId || msg.name === username
                  const canDelete = isOwn || isHost
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 group ${isOwn ? "flex-row-reverse" : ""}`}
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                        <span className="text-[10px] font-bold text-primary">
                          {msg.name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="max-w-[75%] space-y-0.5">
                        <div className={[
                          "rounded-2xl px-3 py-2",
                          isOwn
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-card/80 rounded-tl-sm",
                        ].join(" ")}>
                          {!isOwn && (
                            <p className="text-[10px] font-semibold text-primary mb-0.5">
                              {msg.name}
                            </p>
                          )}
                          {msg.replyTo && <ReplyBlock reply={msg.replyTo} own={isOwn} />}
                          <p className="text-sm">{msg.msg}</p>
                        </div>
                        <div className={[
                          "flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity",
                          isOwn ? "justify-end" : "justify-start",
                        ].join(" ")}>
                          <button
                            onClick={() => setReplyTo({ id: msg.id, name: msg.name, msg: msg.msg })}
                            className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Reply className="w-3 h-3" /> Reply
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => deleteMessage(msg.id, msg.guestId)}
                              className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Reply indicator */}
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-primary/10 rounded-xl border border-primary/20">
                <Reply className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-primary">{replyTo.name}</p>
                  <p className="text-xs truncate text-muted-foreground">{replyTo.msg}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                placeholder={replyTo ? `Replying to ${replyTo.name}…` : "Type a message…"}
                className="rounded-xl bg-background/50"
              />
              <Button onClick={sendChat} size="icon" className="rounded-xl flex-shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ════════ Members Tab (host only) ════════ */}
        {activeTab === "members" && isHost && (
          <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-3xl p-5 shadow-xl space-y-6">

            {/* Active guests */}
            <div>
              <h2 className="font-semibold mb-4 text-sm text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Active Guests ({guests.length})
              </h2>
              {guests.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground opacity-50">
                  <Users className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">No guests have joined yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {guests.map(g => (
                    <div
                      key={g.id}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-card/40"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {g.name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {g.name}
                          {g.id === guestId && (
                            <span className="ml-1 text-xs bg-primary/20 text-primary rounded-full px-1.5 py-0.5">
                              You (Host)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Joined {new Date(g.joinedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      {g.id !== guestId && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-full text-xs h-7 px-3 gap-1"
                          onClick={() => kickGuest(g.id)}
                        >
                          <UserX className="w-3 h-3" /> Kick
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Kicked guests with restore option */}
            {kickedGuests.length > 0 && (
              <div>
                <h2 className="font-semibold mb-3 text-sm text-muted-foreground flex items-center gap-2">
                  <ShieldX className="w-4 h-4" />
                  Kicked ({kickedGuests.length})
                </h2>
                <div className="space-y-2">
                  {kickedGuests.map(kId => (
                    <div
                      key={kId}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/20"
                    >
                      <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                        <UserX className="w-4 h-4 text-destructive" />
                      </div>
                      <p className="flex-1 text-xs text-muted-foreground font-mono truncate">
                        {kId.slice(0, 20)}…
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-xs h-7 px-3 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => unkickGuest(kId)}
                      >
                        <ShieldCheck className="w-3 h-3" /> Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
