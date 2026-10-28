import { lazy, Suspense, useEffect, useState } from 'react'
import { lookupBarcode, searchFoods } from '../lib/openFoodFacts'
import { findByBarcode, myFoods, recentFoods, searchMyFoods, useStore, type MyFood } from '../lib/store'
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
  const [lookingUp, setLookingUp] = useState(false)
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

    setLookingUp(true)
    try {
      const food = await lookupBarcode(code)
      if (food) onSelectFood(food)
      else setNotFoundCode(code)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error buscando el código')
    } finally {
      setLookingUp(false)
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

  // Section 1: the user's own foods. Also any Open Food Facts result the user already logged,
  // even if its name didn't match the query, shown with the user's own copy.
  let mine: MyFood[] = []
  let off: Food[] = []
  if (searching) {
    mine = searchMyFoods(store, query)
    const mineKeys = new Set(mine.map((m) => m.food.barcode ?? m.food.id))
    const knownByBarcode = new Map(myFoods(store).filter((m) => m.food.barcode).map((m) => [m.food.barcode!, m]))
    for (const f of results ?? []) {
      const known = f.barcode ? knownByBarcode.get(f.barcode) : undefined
      if (known && !mineKeys.has(f.barcode!)) {
        mine.push(known)
        mineKeys.add(f.barcode!)
      }
    }
    off = (results ?? []).filter((f) => !mineKeys.has(f.barcode ?? f.id))
  }

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
      {lookingUp && <p className="muted center">Buscando el código…</p>}
      {!searching && error && <p className="error">{error}</p>}

      {searching ? (
        <>
          <section className="food-section">
            <h4 className="list-title mine">
              <StarIcon /> Mis alimentos
            </h4>
            {mine.length > 0 ? (
              <div className="card list mine">
                {mine.map((m) => (
                  <FoodRow key={m.food.barcode ?? m.food.id} food={m.food} mine={m} onSelect={onSelectFood} />
                ))}
              </div>
            ) : (
              <p className="muted small section-empty">Ninguno de tus alimentos coincide.</p>
            )}
          </section>

          <section className="food-section">
            <h4 className="list-title">
              <GlobeIcon /> Open Food Facts
            </h4>
            {loading && <p className="muted small section-empty">Buscando…</p>}
            {error && <p className="error small section-empty">{error}</p>}
            {!loading && !error && results && off.length === 0 && (
              <p className="muted small section-empty">Sin otros resultados.</p>
            )}
            {off.length > 0 && (
              <div className="card list">
                {off.map((f) => (
                  <FoodRow key={f.id} food={f} onSelect={onSelectFood} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="food-section">
          <h4 className="list-title mine">
            <StarIcon /> Recientes
          </h4>
          {recents.length > 0 ? (
            <div className="card list mine">
              {recents.map((f) => (
                <FoodRow key={f.id} food={f} onSelect={onSelectFood} />
              ))}
            </div>
          ) : (
            <p className="muted small section-empty">Todavía no registraste alimentos.</p>
          )}
        </section>
      )}

      <button className="link add" onClick={() => onCreateFood()}>
        + Crear alimento manualmente
      </button>
    </div>
  )
}

function FoodRow({ food: f, mine, onSelect }: { food: Food; mine?: MyFood; onSelect: (f: Food) => void }) {
  const created = f.id.startsWith('custom:')
  return (
    <button className="food-row" onClick={() => onSelect(f)}>
      <div>
        <span className="entry-name">{f.name}</span>
        <small>
          {f.brand ? `${f.brand} · ` : ''}
          {f.servingGrams ? `${f.servingGrams} g` : '100 g'}
          {mine && mine.timesLogged > 0 && ` · ${mine.timesLogged === 1 ? '1 vez' : `${mine.timesLogged} veces`}`}
        </small>
        {mine && <span className={`tag ${created ? 'tag-custom' : 'tag-off'}`}>{created ? 'Creado por vos' : 'Open Food Facts'}</span>}
      </div>
      <span className="entry-kcal">{Math.round((f.per100g.kcal * (f.servingGrams ?? 100)) / 100)}</span>
    </button>
  )
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
    </svg>
  )
}

function BarcodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2 4h2v16H2zM6 4h1v16H6zM9 4h2v16H9zM13 4h1v16h-1zM16 4h2v16h-2zM20 4h1v16h-1zM22 4h0v16z" />
    </svg>
  )
}
