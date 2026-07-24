"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Users, Music, Trash2, SkipForward, UserX, ShieldCheck, ShieldX,
  Copy, Check, MessageCircle, Send, Reply, X, ListMusic,
  LogOut, Share2, ChevronUp, ChevronDown, Play, Crown, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAudio } from "@/lib/audio-context"

const PARTY_SERVER = process.env.NEXT_PUBLIC_PARTY_SERVER || "https://y-brown-two.vercel.app"

// ── Types ────────────────────────────────────────────────────────────────────
interface QueueItem {
  id: string; title: string; artist: string; thumbnail: string
  addedBy: string; addedById: string | null; addedAt: number
  upvotes: number; downvotes: number
}
interface ChatMsg {
  id: string; name: string; guestId: string | null; msg: string; at: number
  replyTo?: { id: string; name: string; msg: string }
}
interface Guest { id: string; name: string; joinedAt: number }

function getHostId(partyId: string): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem(`musicanaz_party_host_${partyId}`) } catch { return null }
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// ── Tiny pill badge ───────────────────────────────────────────────────────────
function Badge({ children, color = "primary" }: { children: React.ReactNode; color?: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-${color}/15 text-${color}`}>
      {children}
    </span>
  )
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function Section({ title, icon: Icon, count, children }: {
  title: string; icon: any; count?: number; children: React.ReactNode
}) {
  return (
    <div className="bg-card/50 backdrop-blur border border-border/50 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-card/30">
        <Icon className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">{title}</span>
        {count !== undefined && (
          <span className="ml-auto text-xs text-muted-foreground">{count}</span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

export default function HostDashboard() {
  const { id }       = useParams()
  const router       = useRouter()
  const { playSong, currentSong: playerSong } = useAudio()
  const partyId      = typeof id === "string" ? id : ""
  const hostId       = getHostId(partyId)

  // Redirect non-hosts back to guest view
  useEffect(() => {
    if (partyId && !hostId) router.replace(`/party/${partyId}`)
  }, [partyId, hostId, router])

  // ── State ────────────────────────────────────────────────────────────────
  const [queue,        setQueue]        = useState<QueueItem[]>([])
  const [currentSong,  setCurrentSong]  = useState<any>(null)
  const [guests,       setGuests]       = useState<Guest[]>([])
  const [kickedGuests, setKickedGuests] = useState<string[]>([])
  const [chat,         setChat]         = useState<ChatMsg[]>([])
  const [guestCount,   setGuestCount]   = useState(0)
  const [chatInput,    setChatInput]    = useState("")
  const [replyTo,      setReplyTo]      = useState<{ id: string; name: string; msg: string } | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [activeTab,    setActiveTab]    = useState<"queue" | "guests" | "chat">("queue")
  const [popping,      setPopping]      = useState(false)
  const [ending,       setEnding]       = useState(false)
  const [dragIdx,      setDragIdx]      = useState<number | null>(null)
  const [dropIdx,      setDropIdx]      = useState<number | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  const partyUrl = typeof window !== "undefined"
    ? `${window.location.origin}/party/${partyId}`
    : `/party/${partyId}`

  // Net score helper
  const netScore = (s: QueueItem) => (s.upvotes || 0) - (s.downvotes || 0)

  // Sorted queue (by net score desc, then addedAt asc)
  const sortedQueue = [...queue].sort((a, b) => {
    const d = netScore(b) - netScore(a)
    return d !== 0 ? d : (a.addedAt || 0) - (b.addedAt || 0)
  })

  // ── Poll ─────────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    if (!partyId) return
    try {
      const res = await fetch(`${PARTY_SERVER}/party/${partyId}`)
      if (!res.ok) { if (res.status === 404) router.push("/"); return }
      const d = await res.json()
      setQueue(d.queue        || [])
      setCurrentSong(d.currentSong || null)
      setGuests(d.guests      || [])
      setKickedGuests(d.kickedGuests || [])
      setChat(d.chat          || [])
      setGuestCount(d.guestCount || 0)
    } catch {}
  }, [partyId, router])

  useEffect(() => {
    if (!partyId || !hostId) return
    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [partyId, hostId, poll])

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === "chat") chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat, activeTab])

  // ── Queue: remove ────────────────────────────────────────────────────────
  const removeSong = async (songId: string) => {
    setQueue(prev => prev.filter(s => s.id !== songId))   // optimistic
    try {
      const res = await fetch(
        `${PARTY_SERVER}/party/${partyId}/queue/${songId}?hostId=${hostId}`,
        { method: "DELETE" }
      )
      if (res.ok) { const d = await res.json(); if (d.queue) setQueue(d.queue) }
      else await poll()
    } catch { await poll() }
  }

  // ── Queue: pop (mark top as played) ─────────────────────────────────────
  const popQueue = async () => {
    if (!sortedQueue.length) return
    setPopping(true)
    try {
      const res = await fetch(`${PARTY_SERVER}/party/${partyId}/queue/pop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId }),
      })
      if (res.ok) { const d = await res.json(); if (d.queue) setQueue(d.queue) }
      else await poll()
    } catch { await poll() }
    setPopping(false)
  }

  // ── Queue: move up/down (manual reorder via reorder endpoint) ────────────
  const moveItem = async (fromIdx: number, dir: -1 | 1) => {
    const toIdx = fromIdx + dir
    if (toIdx < 0 || toIdx >= sortedQueue.length) return
    const reordered = [...sortedQueue]
    ;[reordered[fromIdx], reordered[toIdx]] = [reordered[toIdx], reordered[fromIdx]]
    setQueue(reordered)   // optimistic
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}/queue/reorder`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId, songIds: reordered.map(s => s.id) }),
      })
    } catch {}
  }

  // ── Update current song on party server (so guests see it) ───────────────
  const pushCurrentSong = async (song: any) => {
    if (!song) return
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}/song?hostId=${hostId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song }),
      })
      setCurrentSong(song)
    } catch {}
  }

  // ── Guests: kick / unkick ────────────────────────────────────────────────
  const kickGuest = async (guestId: string) => {
    setGuests(prev => prev.filter(g => g.id !== guestId))
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}/kick`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId, guestId }),
      })
      await poll()
    } catch { await poll() }
  }

  const unkickGuest = async (guestId: string) => {
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}/unkick`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId, guestId }),
      })
      await poll()
    } catch {}
  }

  // ── Chat: send ───────────────────────────────────────────────────────────
  const sendChat = async () => {
    const msg = chatInput.trim()
    if (!msg) return
    const optimistic: ChatMsg = {
      id: `opt_${Date.now()}`, name: "Host (You)", guestId: null,
      msg, at: Date.now(), replyTo: replyTo ?? undefined,
    }
    setChat(prev => [...prev, optimistic])
    setChatInput(""); setReplyTo(null)
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Host", guestId: "host", msg, replyTo: replyTo ?? undefined }),
      })
      await poll()
    } catch {}
  }

  // ── Chat: delete (host can delete any) ───────────────────────────────────
  const deleteMsg = async (msgId: string) => {
    setChat(prev => prev.filter(m => m.id !== msgId))
    try {
      await fetch(
        `${PARTY_SERVER}/party/${partyId}/chat/${msgId}?hostId=${hostId}`,
        { method: "DELETE" }
      )
    } catch {}
  }

  // ── Copy party link ───────────────────────────────────────────────────────
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(partyUrl) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── End party ────────────────────────────────────────────────────────────
  const endParty = async () => {
    if (!confirm("End this party? All guests will be disconnected.")) return
    setEnding(true)
    try {
      await fetch(`${PARTY_SERVER}/party/${partyId}?hostId=${hostId}`, { method: "DELETE" })
      if (typeof window !== "undefined") {
        try { localStorage.removeItem(`musicanaz_party_host_${partyId}`) } catch {}
      }
    } catch {}
    router.push("/player")
  }

  if (!hostId) return null   // redirecting

  const tabs = ["queue", "guests", "chat"] as const

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-background">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground flex-shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Host Dashboard</h1>
              <p className="text-xs text-muted-foreground font-mono">
                {partyId} · {guestCount} listener{guestCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              className="rounded-full gap-1.5 text-xs h-8"
              onClick={copyLink}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button
              size="sm" variant="destructive"
              className="rounded-full gap-1.5 text-xs h-8"
              onClick={endParty} disabled={ending}
            >
              {ending ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
              End
            </Button>
          </div>
        </div>

        {/* ── QR + share bar ───────────────────────────────────────────── */}
        <div className="bg-card/50 border border-border/40 rounded-2xl p-4 flex items-center gap-4">
          <div className="bg-white p-2 rounded-xl shadow flex-shrink-0">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(partyUrl)}`}
              alt="Party QR" className="w-20 h-20"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Share with guests</p>
            <p className="text-xs font-mono truncate text-foreground/70">{partyUrl}</p>
            <Button size="sm" className="rounded-full gap-1.5 h-7 text-xs" onClick={copyLink}>
              <Share2 className="w-3 h-3" />
              {copied ? "Link copied!" : "Share link"}
            </Button>
          </div>
        </div>

        {/* ── Now Playing ──────────────────────────────────────────────── */}
        {(currentSong || playerSong) && (() => {
          const song = currentSong || playerSong
          return (
            <div className="bg-card/50 border border-border/40 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
                  Now Playing
                </p>
                <p className="font-bold text-sm truncate">{song.title}</p>
                <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm" variant="secondary"
                  className="rounded-full h-8 text-xs gap-1.5"
                  onClick={() => playSong(song, true)}
                  title="Play on this device"
                >
                  <Play className="w-3 h-3 fill-current" /> Play
                </Button>
                {sortedQueue.length > 0 && (
                  <Button
                    size="icon" variant="outline"
                    className="rounded-full h-8 w-8"
                    onClick={popQueue} disabled={popping}
                    title="Mark as played & remove from queue"
                  >
                    {popping
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <SkipForward className="w-3.5 h-3.5" />}
                  </Button>
                )}
                <Button
                  size="sm" variant="default"
                  className="rounded-full h-8 text-xs gap-1.5"
                  onClick={() => pushCurrentSong(playerSong)}
                  title="Broadcast the song playing on your device to all guests"
                  disabled={!playerSong}
                >
                  <Share2 className="w-3 h-3" /> Sync
                </Button>
              </div>
            </div>
          )
        })()}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-card/40 rounded-2xl p-1 border border-border/30">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                "flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab === "queue" && `🎵 Queue${sortedQueue.length ? ` (${sortedQueue.length})` : ""}`}
              {tab === "guests" && `👥 Guests${guests.length ? ` (${guests.length})` : ""}`}
              {tab === "chat" && `💬 Chat${chat.length ? ` (${chat.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* ════════ Queue Tab ════════ */}
        {activeTab === "queue" && (
          <Section title="Party Queue" icon={ListMusic} count={sortedQueue.length}>
            {sortedQueue.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground opacity-50">
                <Music className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">Queue is empty — guests can add songs</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedQueue.map((song, i) => {
                  const net = netScore(song)
                  return (
                    <div
                      key={song.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-card/40 hover:bg-card/70 transition-colors group"
                    >
                      {/* Position */}
                      <span className="text-xs text-muted-foreground w-5 text-center font-mono flex-shrink-0">
                        {i + 1}
                      </span>

                      {/* Thumbnail */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{song.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {song.artist}
                          {song.addedBy && (
                            <span className="ml-1 text-primary/70">· {song.addedBy}</span>
                          )}
                        </p>
                      </div>

                      {/* Vote score */}
                      <span className={[
                        "text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0",
                        net > 0 ? "bg-green-500/15 text-green-500"
                          : net < 0 ? "bg-red-500/15 text-red-500"
                          : "bg-muted text-muted-foreground",
                      ].join(" ")}>
                        {net > 0 ? `+${net}` : net}
                      </span>

                      {/* Controls */}
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveItem(i, -1)} disabled={i === 0}
                          className="p-1 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                          title="Move up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveItem(i, 1)} disabled={i === sortedQueue.length - 1}
                          className="p-1 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                          title="Move down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeSong(song.id)}
                          className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        )}

        {/* ════════ Guests Tab ════════ */}
        {activeTab === "guests" && (
          <div className="space-y-3">
            {/* Active guests */}
            <Section title="Active Guests" icon={Users} count={guests.length}>
              {guests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground opacity-50">
                  <Users className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No guests have joined yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {guests.map(g => (
                    <div key={g.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-card/40">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {g.name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Joined {fmtTime(g.joinedAt)}
                        </p>
                      </div>
                      <Button
                        size="sm" variant="destructive"
                        className="rounded-full h-7 text-xs gap-1 px-3 flex-shrink-0"
                        onClick={() => kickGuest(g.id)}
                      >
                        <UserX className="w-3 h-3" /> Kick
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Kicked guests */}
            {kickedGuests.length > 0 && (
              <Section title="Banned" icon={ShieldX} count={kickedGuests.length}>
                <div className="space-y-2">
                  {kickedGuests.map(kId => (
                    <div key={kId} className="flex items-center gap-3 p-2.5 rounded-xl bg-destructive/5 border border-destructive/20">
                      <div className="w-8 h-8 rounded-full bg-destructive/15 flex items-center justify-center flex-shrink-0">
                        <ShieldX className="w-4 h-4 text-destructive" />
                      </div>
                      <p className="flex-1 text-xs font-mono text-muted-foreground truncate">
                        {kId.slice(0, 24)}…
                      </p>
                      <Button
                        size="sm" variant="outline"
                        className="rounded-full h-7 text-xs gap-1 px-3 border-primary/30 text-primary hover:bg-primary/10 flex-shrink-0"
                        onClick={() => unkickGuest(kId)}
                      >
                        <ShieldCheck className="w-3 h-3" /> Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ════════ Chat Tab ════════ */}
        {activeTab === "chat" && (
          <Section title="Chat" icon={MessageCircle} count={chat.length}>
            <div className="h-[50vh] overflow-y-auto space-y-2 mb-3 pr-1">
              {chat.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground opacity-50">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No messages yet</p>
                </div>
              ) : (
                chat.map(msg => {
                  const isHostMsg = msg.guestId === "host" || msg.guestId === null
                  return (
                    <div key={msg.id} className={`flex gap-2 group ${isHostMsg ? "flex-row-reverse" : ""}`}>
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                        <span className="text-[10px] font-bold text-primary">
                          {msg.name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className={`max-w-[75%] space-y-0.5 ${isHostMsg ? "items-end" : "items-start"} flex flex-col`}>
                        <div className={[
                          "rounded-2xl px-3 py-2 text-sm",
                          isHostMsg
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-card/80 rounded-tl-sm",
                        ].join(" ")}>
                          {!isHostMsg && (
                            <p className="text-[10px] font-semibold text-primary mb-0.5">{msg.name}</p>
                          )}
                          {msg.replyTo && (
                            <div className={[
                              "text-[10px] rounded-lg px-2 py-1 mb-1 border-l-2 opacity-80",
                              isHostMsg
                                ? "border-primary-foreground/60 bg-primary-foreground/10"
                                : "border-primary/60 bg-primary/10",
                            ].join(" ")}>
                              <span className="font-bold">{msg.replyTo.name}: </span>{msg.replyTo.msg}
                            </div>
                          )}
                          <p>{msg.msg}</p>
                        </div>
                        {/* Host action row */}
                        <div className={`flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${isHostMsg ? "justify-end" : "justify-start"}`}>
                          <button
                            onClick={() => setReplyTo({ id: msg.id, name: msg.name, msg: msg.msg })}
                            className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-primary"
                          >
                            <Reply className="w-3 h-3" /> Reply
                          </button>
                          <button
                            onClick={() => deleteMsg(msg.id)}
                            className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>

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
                placeholder={replyTo ? `Replying to ${replyTo.name}…` : "Send a message as host…"}
                className="rounded-xl bg-background/50 text-sm"
              />
              <Button onClick={sendChat} size="icon" className="rounded-xl flex-shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </Section>
        )}

      </div>
    </div>
  )
}
