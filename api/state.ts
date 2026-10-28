import { applyOps, readState } from '../server/db.js'
import type { Op } from '../src/types.js'

// Protected by the site's Basic Auth (middleware.ts), like the rest of the app.

export async function GET() {
  return Response.json(await readState(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const body = (await request.json()) as { ops?: Op[] }
  if (!Array.isArray(body.ops)) return Response.json({ error: 'ops must be an array' }, { status: 400 })
  await applyOps(body.ops)
  return Response.json({ ok: true })
}
