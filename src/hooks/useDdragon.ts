import { useEffect, useState } from 'react'
import { loadDdragon, type Ddragon } from '../lib/ddragon'

/** Loads Data Dragon once and shares the result across the app. */
export function useDdragon(): Ddragon | null {
  const [dd, setDd] = useState<Ddragon | null>(null)
  useEffect(() => {
    let alive = true
    loadDdragon()
      .then((d) => alive && setDd(d))
      .catch(() => alive && setDd(null))
    return () => {
      alive = false
    }
  }, [])
  return dd
}
