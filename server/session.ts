// Signed session cookie, shared by middleware.ts and the login API. Uses Web Crypto only.
// The signing key includes the password, so changing the password logs every device out.

export const SESSION_COOKIE = 'mf_session'
export const SESSION_DAYS = 365

function credentials() {
  const user = process.env.BASIC_AUTH_USER
  const password = process.env.BASIC_AUTH_PASSWORD
  const secret = process.env.SESSION_SECRET
  return user && password && secret ? { user, password, secret } : undefined
}

export function isConfigured(): boolean {
  return !!credentials()
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sign(payload: string): Promise<string> {
  const c = credentials()!
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${c.secret}:${c.password}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function checkCredentials(user: string, password: string): boolean {
  const c = credentials()
  // Evaluate both comparisons so timing doesn't reveal which one failed.
  return !!c && [safeEqual(user, c.user), safeEqual(password, c.password)].every(Boolean)
}

export async function createSessionCookie(): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  const token = `${expires}.${await sign(String(expires))}`
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`
}

export const clearSessionCookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`

export async function hasValidSession(request: Request): Promise<boolean> {
  if (!credentials()) return false
  const cookie = request.headers.get('cookie') ?? ''
  const token = cookie
    .split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  if (!token) return false
  const [expires, signature] = token.split('.')
  if (!expires || !signature || !(Number(expires) > Date.now())) return false
  return safeEqual(signature, await sign(expires))
}
