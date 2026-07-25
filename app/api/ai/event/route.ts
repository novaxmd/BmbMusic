import { type NextRequest, NextResponse } from "next/server"

const AI_BASE = process.env.AI_API_URL || ""

export async function POST(req: NextRequest) {
  if (!AI_BASE) return NextResponse.json({ ok: false })
  try {
    const body = await req.json()
    // fire-and-forget — we don't block the UI on this
    fetch(`${AI_BASE}/user/event`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(8_000),
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
