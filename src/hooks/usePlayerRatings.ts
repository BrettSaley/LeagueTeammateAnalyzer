import { useEffect, useState } from 'react'
import { runLimited } from '../lib/async'
import { getPlayerRating } from '../lib/ratingClient'
import type { PlayerRating } from '../lib/rating'

export interface RatingRequest {
  puuid: string
  /** epoch ms - rate only games before this moment. Omit for "most recent". */
  before?: number
  /** how many games to average; omit for the default. */
  maxGames?: number
}

/** Stable map key for a request. */
export const ratingKey = (puuid: string, before?: number, maxGames?: number): string =>
  `${puuid}|${before ?? ''}|${maxGames ?? ''}`

/**
 * Resolves a PlayerRating for each request. A map value of `null` means "still
 * loading"; a rating with label "unrated" means there was nothing to rate.
 * Pass an empty list to disable.
 */
export function usePlayerRatings(
  region: string,
  requests: RatingRequest[],
): Map<string, PlayerRating | null> {
  const [ratings, setRatings] = useState<Map<string, PlayerRating | null>>(() => new Map())
  const sig = `${region}#${requests
    .map((r) => ratingKey(r.puuid, r.before, r.maxGames))
    .sort()
    .join(',')}`

  useEffect(() => {
    if (requests.length === 0) {
      setRatings(new Map())
      return
    }

    let cancelled = false
    setRatings((prev) => {
      const next = new Map<string, PlayerRating | null>()
      for (const r of requests) {
        const k = ratingKey(r.puuid, r.before, r.maxGames)
        next.set(k, prev.get(k) ?? null)
      }
      return next
    })

    void runLimited(requests, 5, async (r) => {
      const rating = await getPlayerRating(region, r.puuid, r.before, r.maxGames)
      if (!cancelled) {
        setRatings((prev) =>
          new Map(prev).set(ratingKey(r.puuid, r.before, r.maxGames), rating),
        )
      }
    })

    return () => {
      cancelled = true
    }
    // sig encodes region + every request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  return ratings
}
