import { lazy, Suspense, useEffect, useState } from 'react'
import { lookupBarcode, searchFoods } from '../lib/openFoodFacts'
import { findByBarcode, recentFoods, useStore } from '../lib/store'
import { MEALS, type Food, type Meal } from '../types'

// The scanner pulls in the ZXing decoder, so load it only when the camera is opened.
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'))

interface Props {
  meal: Meal
  onBack: () => void
  onSelectFood: (food: Food) => void
  onCreateFood: (barcode?: string) => void
}

export default function AddFoodPage({ meal, onBack, onSelectFood, onCreateFood }: Props) {
  const store = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null)

  const recents = recentFoods(store)
  const mealLabel = MEALS.find((m) => m.id === meal)?.label

  // Debounced search against Open Food Facts.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        setResults(await searchFoods(q, ctrl.signal))
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Error de búsqueda')
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 400)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  async function handleBarcode(code: string) {
    setScanning(false)
    setNotFoundCode(null)
    setError(null)

    // Foods the user created or already logged take priority (works offline too).
    const known = findByBarcode(store, code)
    if (known) return onSelectFood(known)

    setLoading(true)
    try {
      const food = await lookupBarcode(code)
      if (food) onSelectFood(food)
      else setNotFoundCode(code)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error buscando el código')
    } finally {
      setLoading(false)
    }
  }

  if (scanning) {
    return (
      <Suspense fallback={<p className="muted center">Abriendo cámara…</p>}>
        <BarcodeScanner onDetected={handleBarcode} onClose={() => setScanning(false)} />
      </Suspense>
    )
  }

  const searching = query.trim().length >= 2
  const list = searching ? (results ?? []) : recents

  return (
    <div className="page">
      <div className="topbar">
        <button className="link" onClick={onBack}>
          ‹ Volver
        </button>
        <span>{mealLabel}</span>
        <span style={{ width: 64 }} />
      </div>

      <div className="search-row">
        <input
          type="search"
          placeholder="Buscar un alimento"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.trim().length < 2) {
              setResults(null)
              setError(null)
              setLoading(false)
            }
          }}
          autoFocus
        />
        <button className="btn scan-btn" onClick={() => setScanning(true)} aria-label="Escanear código de barras">
          <BarcodeIcon />
        </button>
      </div>

      {notFoundCode && (
        <div className="card notice">
          <p>
            No encontramos el código <strong>{notFoundCode}</strong>.
          </p>
          <button className="btn" onClick={() => onCreateFood(notFoundCode)}>
            Crear alimento con este código
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted center">Buscando…</p>}

      <h4 className="list-title">{searching ? 'Resultados' : 'Recientes'}</h4>
      {list.length === 0 && !loading && (
        <p className="muted center">{searching ? (results ? 'Sin resultados.' : '') : 'Todavía no registraste alimentos.'}</p>
      )}
      {list.length > 0 && (
        <div className="card list">
          {list.map((f) => (
            <button key={f.id} className="food-row" onClick={() => onSelectFood(f)}>
              <div>
                <span className="entry-name">{f.name}</span>
                <small>
                  {f.brand ? `${f.brand} · ` : ''}
                  {f.servingGrams ? `${f.servingGrams} g` : '100 g'}
                </small>
              </div>
              <span className="entry-kcal">{Math.round((f.per100g.kcal * (f.servingGrams ?? 100)) / 100)}</span>
            </button>
          ))}
        </div>
      )}

      <button className="link add" onClick={() => onCreateFood()}>
        + Crear alimento manualmente
      </button>
    </div>
  )
}

function BarcodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2 4h2v16H2zM6 4h1v16H6zM9 4h2v16H9zM13 4h1v16h-1zM16 4h2v16h-2zM20 4h1v16h-1zM22 4h0v16z" />
    </svg>
  )
}
