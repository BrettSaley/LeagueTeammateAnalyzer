import { useCallback, useEffect, useState } from 'react'

/**
 * Saved players ("favorites"), persisted in localStorage so they survive
 * reloads and are available the next time the app is opened in this browser.
 * There is no server component - this list is per-browser, per-device.
 */

export interface Favorite {
  /** Full Riot ID as typed, e.g. "Faker#KR1". */
  riotId: string
  /** Region code the player was searched under, e.g. "NA". */
  region: string
}

const KEY = 'favorites'

/** Same player twice? Compare on a case-insensitive Riot ID + region. */
const sameFav = (a: Favorite, b: Favorite): boolean =>
  a.riotId.toLowerCase() === b.riotId.toLowerCase() && a.region === b.region

function load(): Favorite[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (f): f is Favorite =>
          !!f && typeof f.riotId === 'string' && typeof f.region === 'string',
      )
      .map((f) => ({ riotId: f.riotId, region: f.region }))
  } catch {
    return []
  }
}

function save(list: Favorite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Private mode / storage disabled - favorites just won't persist.
  }
}

/**
 * Favorites list plus helpers to toggle/remove. Stays in sync across tabs via
 * the `storage` event.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>(load)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setFavorites(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((next: Favorite[]) => {
    setFavorites(next)
    save(next)
  }, [])

  const isFavorite = useCallback(
    (riotId: string, region: string) =>
      favorites.some((f) => sameFav(f, { riotId, region })),
    [favorites],
  )

  const remove = useCallback(
    (riotId: string, region: string) =>
      update(favorites.filter((f) => !sameFav(f, { riotId, region }))),
    [favorites, update],
  )

  const toggle = useCallback(
    (riotId: string, region: string) => {
      const target = { riotId: riotId.trim(), region }
      if (!target.riotId) return
      update(
        favorites.some((f) => sameFav(f, target))
          ? favorites.filter((f) => !sameFav(f, target))
          : [...favorites, target],
      )
    },
    [favorites, update],
  )

  return { favorites, isFavorite, toggle, remove }
}
