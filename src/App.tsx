import { useState } from 'react'
import AddFoodPage from './pages/AddFoodPage'
import CreateFoodPage from './pages/CreateFoodPage'
import DiaryPage from './pages/DiaryPage'
import FoodDetailPage from './pages/FoodDetailPage'
import GymPage from './pages/GymPage'
import WeightPage from './pages/WeightPage'
import { todayISO } from './lib/dates'
import type { DiaryEntry, Food, Meal } from './types'

type Tab = 'diary' | 'weight' | 'gym'

type Screen =
  | { name: 'tab' }
  | { name: 'addFood'; meal: Meal; scan?: boolean }
  | { name: 'createFood'; meal: Meal; barcode?: string }
  | { name: 'foodDetail'; meal: Meal; food: Food; entry?: DiaryEntry; from: 'addFood' | 'tab' }

export default function App() {
  const [tab, setTab] = useState<Tab>('diary')
  const [date, setDate] = useState(todayISO())
  const [screen, setScreen] = useState<Screen>({ name: 'tab' })
  const home = () => setScreen({ name: 'tab' })

  let content
  switch (screen.name) {
    case 'addFood':
      content = (
        <AddFoodPage
          key={screen.scan ? 'scan' : 'search'}
          meal={screen.meal}
          startScanning={screen.scan}
          onBack={home}
          onSelectFood={(food) => setScreen({ name: 'foodDetail', meal: screen.meal, food, from: 'addFood' })}
          onCreateFood={(barcode) => setScreen({ name: 'createFood', meal: screen.meal, barcode })}
        />
      )
      break
    case 'createFood':
      content = (
        <CreateFoodPage
          barcode={screen.barcode}
          onBack={() => setScreen({ name: 'addFood', meal: screen.meal })}
          onCreated={(food) => setScreen({ name: 'foodDetail', meal: screen.meal, food, from: 'addFood' })}
        />
      )
      break
    case 'foodDetail':
      content = (
        <FoodDetailPage
          food={screen.food}
          entry={screen.entry}
          date={date}
          meal={screen.meal}
          onBack={() => (screen.from === 'addFood' ? setScreen({ name: 'addFood', meal: screen.meal }) : home())}
          onDone={home}
        />
      )
      break
    default:
      content =
        tab === 'diary' ? (
          <DiaryPage
            date={date}
            onChangeDate={setDate}
            onAddFood={(meal) => setScreen({ name: 'addFood', meal })}
            onScanFood={(meal) => setScreen({ name: 'addFood', meal, scan: true })}
            onEditEntry={(entry) =>
              setScreen({ name: 'foodDetail', meal: entry.meal, food: entry.food, entry, from: 'tab' })
            }
          />
        ) : tab === 'weight' ? (
          <WeightPage />
        ) : (
          <GymPage />
        )
  }

  return (
    <div className="app">
      <header className="app-header">my fitness</header>
      <main>{content}</main>
      {screen.name === 'tab' && (
        <nav className="tabbar">
          <button className={tab === 'diary' ? 'active' : ''} onClick={() => setTab('diary')}>
            <span aria-hidden>📖</span>
            Diario
          </button>
          <button className={tab === 'weight' ? 'active' : ''} onClick={() => setTab('weight')}>
            <span aria-hidden>⚖️</span>
            Peso
          </button>
          <button className={tab === 'gym' ? 'active' : ''} onClick={() => setTab('gym')}>
            <span aria-hidden>🏋️</span>
            Gym
          </button>
        </nav>
      )}
    </div>
  )
}
