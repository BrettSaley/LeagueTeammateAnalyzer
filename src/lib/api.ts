import { getRegion } from './regions'
import { sleep } from './async'
import type { AccountDto, CurrentGameInfo, LeagueEntryDto, MatchDto } from './types'

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// --- client-side throttle -------------------------------------------------
// The rating feature can fan out to ~60 requests at once. Keep well under the
// shared dev-key limit (20 req/s) with a small concurrency cap plus a minimum
// spacing between request starts.

const MAX_CONCURRENT = 6
const MIN_SPACING_MS = 70
const MAX_RETRIES_429 = 2

let inFlight = 0
const waiters: Array<() => void> = []
let lastStart = 0

async function acquire(): Promise<void> {
  if (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve))
  }
  inFlight++
  const now = Date.now()
  const wait = Math.max(0, lastStart + MIN_SPACING_MS - now)
  lastStart = Math.max(now, lastStart + MIN_SPACING_MS)
  if (wait) await sleep(wait)
}

function release(): void {
  inFlight--
  waiters.shift()?.()
}

// --- core request -------------------------------------------------------

async function riot<T>(routing: string, path: string): Promise<T> {
  const url = `/api/riot?routing=${encodeURIComponent(routing)}&path=${encodeURIComponent(path)}`

  for (let attempt = 0; ; attempt++) {
    await acquire()
    let res: Response
    try {
      res = await fetch(url)
    } finally {
      release()
    }

    const data = (await res.json().catch(() => null)) as
      | (T & { error?: string; message?: string })
      | { error?: string; message?: string }
      | null

    if (res.status === 429 && attempt < MAX_RETRIES_429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2
      await sleep(retryAfter * 1000)
      continue
    }

    if (!res.ok) {
      const msg =
        (data && 'error' in data && data.error) ||
        (data && 'message' in data && data.message) ||
        `Request failed (${res.status})`
      throw new ApiError(String(msg), res.status, data)
    }
    return data as T
  }
}

// --- endpoints --------------------------------------------------------

export function getAccount(regionCode: string, gameName: string, tagLine: string): Promise<AccountDto> {
  const r = getRegion(regionCode)
  const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  return riot<AccountDto>(r.account, path)
}

export function getActiveGame(regionCode: string, puuid: string): Promise<CurrentGameInfo> {
  const r = getRegion(regionCode)
  return riot<CurrentGameInfo>(r.platform, `/lol/spectator/v5/active-games/by-summoner/${puuid}`)
}

export interface MatchIdsOpts {
  /** "ranked" | "normal" | "tourney" | "tutorial" */
  type?: string
  /** specific queue id, e.g. 420 for Ranked Solo/Duo */
  queue?: number
  /** epoch seconds - only matches at/after this time */
  startTime?: number
  /** epoch seconds - only matches at/before this time */
  endTime?: number
}

export function getMatchIds(
  regionCode: string,
  puuid: string,
  count = 10,
  opts: MatchIdsOpts = {},
): Promise<string[]> {
  const r = getRegion(regionCode)
  const params = new URLSearchParams({ start: '0', count: String(count) })
  if (opts.type) params.set('type', opts.type)
  if (opts.queue) params.set('queue', String(opts.queue))
  if (opts.startTime) params.set('startTime', String(opts.startTime))
  if (opts.endTime) params.set('endTime', String(opts.endTime))
  return riot<string[]>(r.regional, `/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`)
}

export function getMatch(regionCode: string, matchId: string): Promise<MatchDto> {
  const r = getRegion(regionCode)
  return riot<MatchDto>(r.regional, `/lol/match/v5/matches/${matchId}`)
}

export function getRankByPuuid(regionCode: string, puuid: string): Promise<LeagueEntryDto[]> {
  const r = getRegion(regionCode)
  return riot<LeagueEntryDto[]>(r.platform, `/lol/league/v4/entries/by-puuid/${puuid}`)
}

// --- session caches (a match never changes; ids rarely do mid-session) ---

const matchCache = new Map<string, Promise<MatchDto>>()
const matchIdsCache = new Map<string, Promise<string[]>>()

export function getMatchCached(regionCode: string, matchId: string): Promise<MatchDto> {
  const key = `${regionCode}:${matchId}`
  let p = matchCache.get(key)
  if (!p) {
    p = getMatch(regionCode, matchId)
    matchCache.set(key, p)
    p.catch(() => matchCache.delete(key))
  }
  return p
}

export function getMatchIdsCached(
  regionCode: string,
  puuid: string,
  count = 10,
  opts: MatchIdsOpts = {},
): Promise<string[]> {
  const key = `${regionCode}:${puuid}:${count}:${opts.type ?? ''}:${opts.queue ?? ''}:${opts.startTime ?? ''}:${opts.endTime ?? ''}`
  let p = matchIdsCache.get(key)
  if (!p) {
    p = getMatchIds(regionCode, puuid, count, opts)
    matchIdsCache.set(key, p)
    p.catch(() => matchIdsCache.delete(key))
  }
  return p
}
