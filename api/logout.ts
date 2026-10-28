import { clearSessionCookie } from '../server/session.js'

export function POST() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie } })
}
