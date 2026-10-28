import { next } from '@vercel/functions'
import { hasValidSession, isConfigured } from './server/session.js'

// Vercel Routing Middleware: everything requires a session cookie (set by /api/login),
// except the login page itself and what the browser fetches without cookies to install the app.
export const config = { matcher: '/:path*' }

const PUBLIC_PATHS = new Set(['/login.html', '/api/login', '/manifest.webmanifest', '/sw.js', '/favicon.svg'])

export default async function middleware(request: Request) {
  const url = new URL(request.url)
  // The MCP endpoint authenticates with its own secret (Claude connectors can't log in).
  if (url.pathname.startsWith('/api/mcp/')) return next()
  if (PUBLIC_PATHS.has(url.pathname) || url.pathname.startsWith('/icons/')) return next()

  if (!isConfigured()) return new Response('Auth no configurada', { status: 500 })
  if (await hasValidSession(request)) return next()

  if (request.method === 'GET' && request.headers.get('accept')?.includes('text/html')) {
    const login = new URL('/login.html', url)
    if (url.pathname !== '/') login.searchParams.set('next', url.pathname + url.search)
    return Response.redirect(login, 302)
  }
  return Response.json({ error: 'No autenticado' }, { status: 401 })
}
