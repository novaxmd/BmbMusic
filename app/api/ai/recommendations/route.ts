import { type NextRequest, NextResponse } from "next/server"

const AI_BASE = process.env.AI_API_URL || ""

export async function GET(req: NextRequest) {
  if (!AI_BASE) return NextResponse.json({ songs: [], personalized: false }, { status: 503 })
  const sp      = req.nextUrl.searchParams
  const user_id = sp.get("user_id") || "anon"
  const limit   = sp.get("limit")   || "20"
  try {
    const res  = await fetch(
      `${AI_BASE}/recommendations/${encodeURIComponent(user_id)}/songs?limit=${limit}`,
      { signal: AbortSignal.timeout(15_000) }
    )
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ songs: [], personalized: false, error: e.message }, { status: 500 })
  }
}
