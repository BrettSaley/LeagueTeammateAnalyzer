import { getMatchCached, getMatchIdsCached, getRankByPuuid, type MatchIdsOpts } from './api'
import { runLimited } from './async'
import { CONFIG, ratePlayer, scoreGame, type PlayerRating } from './rating'

/**
 * Fetches a player's ranked games + current rank and turns them into a
 * PlayerRating (raw score, then graded on the rank scale).
 *
 * `before` (epoch ms) limits games to those played before that moment - used in
 * Match History so a badge reflects the player's form *going into* the match
 * you're looking at. Omit it for "most recent games".
 *
 * Results are cached for the session and concurrent requests for the same
 * (player, before) are de-duplicated. Rank is cached per player.
 */

const done = new Map<string, PlayerRating>()
const inflight = new Map<string, Promise<PlayerRating>>()
const tierCache = new Map<string, string | null>()

export function getPlayerRating(
  regionCode: string,
  puuid: string,
  before?: number,
  maxGames: number = CONFIG.maxGames,
): Promise<PlayerRating> {
  const key = `${regionCode}:${puuid}:${before ?? 'now'}:${maxGames}`
  const cached = done.get(key)
  if (cached) return Promise.resolve(cached)

  let p = inflight.get(key)
  if (!p) {
    p = compute(regionCode, puuid, before, maxGames)
      .then((rating) => {
        done.set(key, rating)
        return rating
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

async function soloTier(regionCode: string, puuid: string): Promise<string | null> {
  const key = `${regionCode}:${puuid}`
  const hit = tierCache.get(key)
  if (hit !== undefined) return hit

  let tier: string | null = null
  try {
    const entries = await getRankByPuuid(regionCode, puuid)
    const entry =
      entries.find((e) => e.queueType === 'RANKED_SOLO_5x5') ??
      entries.find((e) => e.queueType === 'RANKED_FLEX_SR')
    tier = entry?.tier ?? null
  } catch {
    tier = null
  }
  tierCache.set(key, tier)
  return tier
}

async function compute(
  regionCode: string,
  puuid: string,
  before: number | undefined,
  maxGames: number,
): Promise<PlayerRating> {
  const opts: MatchIdsOpts = { type: 'ranked' }
  if (before) opts.endTime = Math.floor(before / 1000)

  const [idsResult, tier] = await Promise.all([
    getMatchIdsCached(regionCode, puuid, maxGames, opts).catch(() => null),
    soloTier(regionCode, puuid),
  ])

  if (!idsResult) return ratePlayer([], tier, maxGames)

  const matches = await runLimited(idsResult, 3, (id) =>
    getMatchCached(regionCode, id).catch(() => null),
  )
  const scores = matches.flatMap((m) => {
    if (!m) return []
    const s = scoreGame(m, puuid)
    return s ? [s] : []
  })
  return ratePlayer(scores, tier, maxGames)
}
