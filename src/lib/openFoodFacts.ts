import type { Food } from '../types'

// Open Food Facts: free, open product database with barcode lookup. No API key needed.
const BASE = 'https://world.openfoodfacts.org'
const FIELDS = 'code,product_name,product_name_es,brands,nutriments,serving_quantity,image_small_url'

interface OffProduct {
  code?: string
  product_name?: string
  product_name_es?: string
  brands?: string
  serving_quantity?: number | string
  image_small_url?: string
  nutriments?: Record<string, number | string | undefined>
}

const UNAVAILABLE = 'Open Food Facts no responde, probá de nuevo en un momento'

/**
 * Open Food Facts occasionally answers 502/503 under load; retry a couple of times.
 * Its error pages lack CORS headers, so in the browser they surface as network errors.
 */
async function fetchWithRetry(url: string, signal?: AbortSignal, attempts = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    let res: Response | undefined
    try {
      res = await fetch(url, { signal })
    } catch (e) {
      if (signal?.aborted) throw e
      if (i >= attempts) throw new Error(UNAVAILABLE)
    }
    if (res && (res.status < 500 || i >= attempts)) return res
    await new Promise((r) => setTimeout(r, 600 * i))
    signal?.throwIfAborted()
  }
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

function toFood(p: OffProduct): Food | null {
  const name = p.product_name_es || p.product_name
  if (!name) return null
  const n = p.nutriments ?? {}
  let kcal = num(n['energy-kcal_100g'])
  if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184 // kJ -> kcal
  const serving = num(p.serving_quantity)
  return {
    id: `off:${p.code}`,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    barcode: p.code,
    imageUrl: p.image_small_url,
    per100g: {
      kcal: Math.round(kcal),
      protein: num(n['proteins_100g']),
      carbs: num(n['carbohydrates_100g']),
      fat: num(n['fat_100g']),
    },
    servingGrams: serving > 0 ? serving : undefined,
  }
}

export async function lookupBarcode(barcode: string): Promise<Food | null> {
  const res = await fetchWithRetry(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(UNAVAILABLE)
  const data = (await res.json()) as { status: number; product?: OffProduct }
  if (data.status !== 1 || !data.product) return null
  return toFood({ ...data.product, code: data.product.code ?? barcode })
}

export async function searchFoods(query: string, signal?: AbortSignal): Promise<Food[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '25',
    fields: FIELDS,
  })
  const res = await fetchWithRetry(`${BASE}/cgi/search.pl?${params}`, signal)
  if (!res.ok) throw new Error(UNAVAILABLE)
  const data = (await res.json()) as { products?: OffProduct[] }
  return (data.products ?? []).map(toFood).filter((f): f is Food => f !== null)
}
