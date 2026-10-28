import { next } from '@vercel/functions'

// Vercel Routing Middleware: protects the whole site with HTTP Basic Auth.
// Credentials come from the BASIC_AUTH_USER / BASIC_AUTH_PASSWORD project env vars.
export const config = { matcher: '/:path*' }

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export default function middleware(request: Request) {
  // The MCP endpoint authenticates with its own secret (Claude connectors can't send Basic Auth).
  if (new URL(request.url).pathname.startsWith('/api/mcp/')) return next()

  const user = process.env.BASIC_AUTH_USER
  const password = process.env.BASIC_AUTH_PASSWORD
  if (!user || !password) return new Response('Auth no configurada', { status: 500 })

  const header = request.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    let decoded = ''
    try {
      decoded = atob(header.slice(6))
    } catch {
      // Malformed header: fall through to 401.
    }
    const sep = decoded.indexOf(':')
    if (sep >= 0 && safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), password)) {
      return next()
    }
  }

  return new Response('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="My Fitness", charset="UTF-8"' },
  })
}
