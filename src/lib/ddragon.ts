/**
 * Data Dragon - Riot's static asset CDN. No API key, CORS-enabled.
 * Used to turn numeric ids (champion / summoner spell / rune) into names and icons.
 */

const BASE = 'https://ddragon.leagueoflegends.com'

interface NamedAsset {
  id: string
  name: string
}

export interface Ddragon {
  version: string
  championIcon(idOrName: number | string): string
  spellIcon(key: number): string
  runeIcon(id: number): string
  profileIcon(id: number): string
}

let cache: Promise<Ddragon> | null = null

export function loadDdragon(): Promise<Ddragon> {
  if (!cache) cache = build()
  return cache
}

async function build(): Promise<Ddragon> {
  const versions = (await fetchJson(`${BASE}/api/versions.json`)) as string[]
  const version = versions[0]

  const [champRaw, spellRaw, runesRaw] = await Promise.all([
    fetchJson(`${BASE}/cdn/${version}/data/en_US/champion.json`),
    fetchJson(`${BASE}/cdn/${version}/data/en_US/summoner.json`),
    fetchJson(`${BASE}/cdn/${version}/data/en_US/runesReforged.json`),
  ])

  const champByKey = new Map<number, NamedAsset>()
  const champById = new Map<string, NamedAsset>()
  for (const c of Object.values((champRaw as { data: Record<string, any> }).data)) {
    const entry: NamedAsset = { id: c.id, name: c.name }
    champByKey.set(Number(c.key), entry)
    champById.set(String(c.id).toLowerCase(), entry)
  }

  const spellByKey = new Map<number, NamedAsset>()
  for (const s of Object.values((spellRaw as { data: Record<string, any> }).data)) {
    spellByKey.set(Number(s.key), { id: s.id, name: s.name })
  }

  const runeIconById = new Map<number, string>()
  for (const style of runesRaw as any[]) {
    runeIconById.set(style.id, style.icon)
    for (const slot of style.slots) {
      for (const rune of slot.runes) runeIconById.set(rune.id, rune.icon)
    }
  }

  return {
    version,
    championIcon(idOrName) {
      const entry =
        typeof idOrName === 'number'
          ? champByKey.get(idOrName)
          : champById.get(idOrName.toLowerCase())
      const id = entry?.id ?? (typeof idOrName === 'string' ? idOrName : undefined)
      return id ? `${BASE}/cdn/${version}/img/champion/${id}.png` : ''
    },
    spellIcon(key) {
      const s = spellByKey.get(key)
      return s ? `${BASE}/cdn/${version}/img/spell/${s.id}.png` : ''
    },
    runeIcon(id) {
      const icon = runeIconById.get(id)
      return icon ? `${BASE}/cdn/img/${icon}` : ''
    },
    profileIcon(id) {
      return `${BASE}/cdn/${version}/img/profileicon/${id}.png`
    },
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Data Dragon request failed: ${url} (${res.status})`)
  return res.json()
}
