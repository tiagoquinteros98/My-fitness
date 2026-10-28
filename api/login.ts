import { Redis } from '@upstash/redis'
import { checkCredentials, createSessionCookie, isConfigured } from '../server/session.js'

// Brute-force guard: at most MAX_FAILURES wrong passwords per IP every WINDOW_S seconds.
const MAX_FAILURES = 10
const WINDOW_S = 15 * 60

export async function POST(request: Request) {
  if (!isConfigured()) return Response.json({ error: 'Login no configurado' }, { status: 500 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
  const key = `${process.env.DATA_PREFIX || 'mf'}:login-failures:${ip}`
  if (Number(await redis.get(key)) >= MAX_FAILURES) {
    return Response.json({ error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => ({}))) as { user?: string; password?: string }
  if (!checkCredentials(String(body.user ?? ''), String(body.password ?? ''))) {
    const p = redis.pipeline()
    p.incr(key)
    p.expire(key, WINDOW_S)
    await p.exec()
    return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
  }

  await redis.del(key)
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': await createSessionCookie() } })
}
