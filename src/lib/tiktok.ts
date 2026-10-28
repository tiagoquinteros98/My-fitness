// Technique videos on TikTok (browser only).

const TIKTOK_PACKAGE = 'com.zhiliaoapp.musically'

/** Search query for an exercise's technique, URL-encoded. */
export function tiktokQuery(name: string): string {
  return encodeURIComponent(name.replace('°', ' grados') + ' técnica gimnasio')
}

export function tiktokSearchUrl(name: string): string {
  return `https://www.tiktok.com/search?q=${tiktokQuery(name)}`
}

/**
 * Opens the TikTok app on the search.
 * Android: intent:// with the browser URL as fallback inside it, so it never fails when the
 *          app isn't installed. Returns true when it handled the click.
 * iOS: the https link is already a Universal Link and opens the app by itself.
 * Desktop: stays in the browser.
 */
export function openTiktokApp(name: string): boolean {
  if (!/android/i.test(navigator.userAgent)) return false
  const fallback = encodeURIComponent(tiktokSearchUrl(name))
  window.location.href =
    `intent://search?keyword=${tiktokQuery(name)}#Intent;scheme=snssdk1233;` +
    `package=${TIKTOK_PACKAGE};S.browser_fallback_url=${fallback};end`
  return true
}
