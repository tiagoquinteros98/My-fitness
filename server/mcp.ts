import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { lookupBarcode } from '../src/lib/openFoodFacts.js'
import { normalize, nutrientsFor } from '../src/lib/nutrition.js'
import { MACROS, MEALS, type AppState, type DiaryEntry, type Food, type Meal } from '../src/types.js'
import { applyOps, readState } from './db.js'

const TIME_ZONE = 'America/Argentina/Buenos_Aires'

const INSTRUCTIONS = `My Fitness es el diario de comidas y peso del usuario (estilo MyFitnessPal).

Cómo cargar comida:
- Foto de una tabla nutricional: leé los valores y convertilos a valores por 100 g (si la tabla es por porción, dividí por los gramos de la porción y multiplicá por 100). Guardá también el tamaño de porción. Si en la foto se ve el código de barras, pasalo en "barcode" para que la próxima vez el escáner de la app lo encuentre.
- Foto de un plato o comida sin etiqueta: estimá los valores por 100 g y los gramos, y decile al usuario que es una estimación.
- Solo un nombre: usá primero search_my_foods; si no está, lookup_barcode si hay código; si no, usá valores nutricionales típicos.
- Si el usuario no dice los gramos ni porciones, preguntale. Si no dice la comida (desayuno, almuerzo, cena, snacks), inferila por la hora o preguntá.
- Fechas en formato YYYY-MM-DD; si no se indica, es hoy (hora de Argentina).
Después de registrar, contale al usuario qué se cargó y cómo va el día respecto a sus objetivos.`

const MEAL_IDS = MEALS.map((m) => m.id) as [Meal, ...Meal[]]
const mealLabel = (m: Meal) => MEALS.find((x) => x.id === m)!.label

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date())
}

const r1 = (n: number) => Math.round(n * 10) / 10

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] }
}

/** Saved foods first, then foods only seen in the diary; unique by barcode or id. */
function knownFoods(state: AppState): Food[] {
  const seen = new Set<string>()
  const out: Food[] = []
  const add = (f: Food) => {
    const k = f.barcode ?? f.id
    if (!seen.has(k)) {
      seen.add(k)
      out.push(f)
    }
  }
  state.customFoods.forEach(add)
  for (let i = state.diary.length - 1; i >= 0; i--) add(state.diary[i].food)
  return out
}

function describeFood(f: Food) {
  return {
    id: f.id,
    name: f.name,
    brand: f.brand,
    barcode: f.barcode,
    per100g: f.per100g,
    servingGrams: f.servingGrams,
  }
}

function daySummary(state: AppState, date: string): string {
  const entries = state.diary.filter((e) => e.date === date)
  const totals = { kcal: 0, carbs: 0, fat: 0, protein: 0 }
  const lines: string[] = [`Día ${date}`]
  for (const meal of MEALS) {
    const mealEntries = entries.filter((e) => e.meal === meal.id)
    if (!mealEntries.length) continue
    lines.push(`\n${meal.label}:`)
    for (const e of mealEntries) {
      const n = nutrientsFor(e.food, e.grams)
      totals.kcal += n.kcal
      totals.carbs += n.carbs
      totals.fat += n.fat
      totals.protein += n.protein
      lines.push(
        `- ${e.food.name}${e.food.brand ? ` (${e.food.brand})` : ''}, ${e.grams} g: ${Math.round(n.kcal)} kcal, C ${r1(n.carbs)} g, G ${r1(n.fat)} g, P ${r1(n.protein)} g [entry_id ${e.id}]`,
      )
    }
  }
  if (!entries.length) lines.push('Sin comidas registradas.')
  const { calorieGoal, macroGoals } = state.settings
  lines.push(`\nTotal: ${Math.round(totals.kcal)} de ${calorieGoal} kcal (quedan ${calorieGoal - Math.round(totals.kcal)})`)
  for (const m of MACROS) {
    const goal = macroGoals[m.id]
    const eaten = Math.round(totals[m.id])
    lines.push(`${m.label}: ${eaten} g${goal ? ` de ${goal} g (${goal - eaten >= 0 ? `faltan ${goal - eaten}` : `+${eaten - goal}`} g)` : ''}`)
  }
  return lines.join('\n')
}

const foodFields = {
  name: z.string().optional().describe('Nombre del alimento'),
  brand: z.string().optional().describe('Marca'),
  barcode: z.string().optional().describe('Código de barras (EAN/UPC), solo dígitos'),
  kcal_per_100g: z.number().nonnegative().optional(),
  carbs_per_100g: z.number().nonnegative().optional(),
  fat_per_100g: z.number().nonnegative().optional(),
  protein_per_100g: z.number().nonnegative().optional(),
  serving_grams: z.number().positive().optional().describe('Gramos de una porción, si se conoce'),
}

type FoodArgs = {
  food_id?: string
  name?: string
  brand?: string
  barcode?: string
  kcal_per_100g?: number
  carbs_per_100g?: number
  fat_per_100g?: number
  protein_per_100g?: number
  serving_grams?: number
}

/** Find or build the food described by the tool arguments. */
async function resolveFood(state: AppState, a: FoodArgs): Promise<Food | string> {
  const known = knownFoods(state)
  const barcode = a.barcode?.replace(/\D/g, '') || undefined

  if (a.kcal_per_100g !== undefined) {
    if (!a.name) return 'Falta el nombre del alimento.'
    const existing = known.find((f) => (barcode && f.barcode === barcode) || f.id === a.food_id)
    return {
      id: existing?.id.startsWith('custom:') ? existing.id : `custom:${crypto.randomUUID()}`,
      name: a.name,
      brand: a.brand || undefined,
      barcode: barcode ?? existing?.barcode,
      per100g: {
        kcal: Math.round(a.kcal_per_100g),
        carbs: r1(a.carbs_per_100g ?? 0),
        fat: r1(a.fat_per_100g ?? 0),
        protein: r1(a.protein_per_100g ?? 0),
      },
      servingGrams: a.serving_grams ?? existing?.servingGrams,
    }
  }

  const byId = a.food_id && known.find((f) => f.id === a.food_id)
  if (byId) return byId
  const offCode = a.food_id?.startsWith('off:') ? a.food_id.slice(4) : barcode
  if (offCode) {
    const local = known.find((f) => f.barcode === offCode)
    if (local) return local
    const off = await lookupBarcode(offCode)
    if (off) return off
    return `El código ${offCode} no está en la base del usuario ni en Open Food Facts. Pasá los valores nutricionales (kcal_per_100g, etc.).`
  }
  return 'Indicá food_id, barcode, o los valores nutricionales por 100 g (al menos kcal_per_100g) con el nombre.'
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'my-fitness', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'search_my_foods',
    {
      description: 'Busca por nombre o marca entre los alimentos guardados y registrados antes por el usuario.',
      inputSchema: { query: z.string().describe('Texto a buscar, ej. "yogur serenisima"') },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const state = await readState()
      const words = normalize(query).split(/\s+/).filter(Boolean)
      const matches = knownFoods(state)
        .filter((f) => {
          const hay = normalize(`${f.name} ${f.brand ?? ''} ${f.barcode ?? ''}`)
          return words.every((w) => hay.includes(w))
        })
        .slice(0, 15)
      return text(matches.length ? JSON.stringify(matches.map(describeFood), null, 1) : 'Sin coincidencias.')
    },
  )

  server.registerTool(
    'lookup_barcode',
    {
      description: 'Busca un código de barras en la base del usuario y luego en Open Food Facts.',
      inputSchema: { barcode: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ barcode }) => {
      const food = await resolveFood(await readState(), { barcode })
      return text(typeof food === 'string' ? food : JSON.stringify(describeFood(food), null, 1))
    },
  )

  server.registerTool(
    'log_food',
    {
      description:
        'Registra un alimento en el diario. Identificalo con food_id (de search_my_foods/lookup_barcode), con barcode, o con nombre + valores por 100 g (por ejemplo leídos de una foto de la tabla nutricional). Por defecto también lo guarda en la base de alimentos del usuario.',
      inputSchema: {
        food_id: z.string().optional(),
        ...foodFields,
        grams: z.number().positive().describe('Gramos consumidos (si dice porciones, multiplicá por serving_grams)'),
        meal: z.enum(MEAL_IDS).describe('breakfast=desayuno, lunch=almuerzo, dinner=cena, snacks'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; por defecto hoy'),
        save_to_database: z.boolean().default(true),
      },
    },
    async (args) => {
      const state = await readState()
      const food = await resolveFood(state, args)
      if (typeof food === 'string') return { ...text(food), isError: true }
      const now = Date.now()
      const saved = args.save_to_database ? { ...food, savedAt: now } : food
      const entry: DiaryEntry = {
        id: crypto.randomUUID(),
        date: args.date ?? today(),
        meal: args.meal,
        food: saved,
        grams: r1(args.grams),
        createdAt: now,
      }
      await applyOps([
        ...(args.save_to_database ? [{ type: 'putFood' as const, food: saved }] : []),
        { type: 'putDiary', entry },
      ])
      state.diary.push(entry)
      const n = nutrientsFor(food, entry.grams)
      return text(
        `Registrado en ${mealLabel(entry.meal)}: ${food.name}, ${entry.grams} g = ${Math.round(n.kcal)} kcal` +
          `${args.save_to_database ? ' (guardado en la base de alimentos)' : ''}.\n\n${daySummary(state, entry.date)}`,
      )
    },
  )

  server.registerTool(
    'save_food',
    {
      description: 'Guarda un alimento en la base del usuario sin registrarlo en el diario (para escanearlo o buscarlo después).',
      inputSchema: { ...foodFields, name: z.string(), kcal_per_100g: z.number().nonnegative() },
    },
    async (args) => {
      const food = await resolveFood(await readState(), args)
      if (typeof food === 'string') return { ...text(food), isError: true }
      await applyOps([{ type: 'putFood', food: { ...food, savedAt: Date.now() } }])
      return text(`Guardado: ${JSON.stringify(describeFood(food))}`)
    },
  )

  server.registerTool(
    'get_day_summary',
    {
      description: 'Muestra lo registrado en un día, con totales y progreso contra los objetivos de calorías y macros.',
      inputSchema: { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; por defecto hoy') },
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => text(daySummary(await readState(), date ?? today())),
  )

  server.registerTool(
    'delete_diary_entry',
    {
      description: 'Borra una entrada del diario (entry_id sale de get_day_summary o log_food).',
      inputSchema: { entry_id: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ entry_id }) => {
      const state = await readState()
      const entry = state.diary.find((e) => e.id === entry_id)
      if (!entry) return { ...text('No existe esa entrada.'), isError: true }
      await applyOps([{ type: 'deleteDiary', id: entry_id }])
      return text(`Borrado: ${entry.food.name}, ${entry.grams} g (${entry.date}, ${mealLabel(entry.meal)}).`)
    },
  )

  server.registerTool(
    'log_weight',
    {
      description: 'Registra el peso del usuario en kg (uno por día; reemplaza el de esa fecha).',
      inputSchema: {
        kg: z.number().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; por defecto hoy'),
      },
    },
    async ({ kg, date }) => {
      const state = await readState()
      const d = date ?? today()
      const value = r1(kg)
      await applyOps([{ type: 'putWeight', entry: { id: crypto.randomUUID(), date: d, kg: value } }])
      const previous = state.weights.filter((w) => w.date < d).at(-1)
      const goal = state.settings.goalWeightKg
      return text(
        `Peso registrado: ${value} kg el ${d}.` +
          (previous ? ` Anterior: ${previous.kg} kg (${previous.date}).` : '') +
          (goal ? ` Objetivo: ${goal} kg.` : ''),
      )
    },
  )

  return server
}
