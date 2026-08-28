import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Thin, allow-listed proxy for the Riot API.
 *
 * The browser cannot call Riot directly (no CORS headers) and the API key
 * must never reach the client, so every Riot request goes through here.
 * The client sends:  /api/riot?routing=<host>&path=<riot path incl. query>
 *
 * This file is self-contained on purpose: Vercel compiles it to native ESM,
 * where a bare `import './_handler'` (no extension) fails to resolve.
 *
 * It's the Vercel serverless function entry point; local dev runs the same
 * handler via middleware in vite.config.ts.
 */

const ROUTING = new Set([
  // regional (account, match)
  'americas', 'asia', 'europe', 'sea',
  // platform (spectator, league, summoner)
  'na1', 'br1', 'la1', 'la2', 'euw1', 'eun1', 'tr1', 'ru', 'kr', 'jp1', 'oc1',
])

const ALLOWED_PATH_PREFIXES = [
  '/riot/account/v1/accounts/by-riot-id/',
  '/riot/account/v1/accounts/by-puuid/',
  '/lol/spectator/v5/active-games/by-summoner/',
  '/lol/match/v5/matches/by-puuid/',
  '/lol/match/v5/matches/',
  '/lol/league/v4/entries/by-puuid/',
  '/lol/summoner/v4/summoners/by-puuid/',
]

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url || '', 'http://localhost')
    const routing = (url.searchParams.get('routing') || '').toLowerCase()
    const path = url.searchParams.get('path') || ''

    if (!ROUTING.has(routing)) {
      return send(res, 400, { error: `Invalid routing value: "${routing}".` })
    }
    if (!path.startsWith('/') || !ALLOWED_PATH_PREFIXES.some((p) => path.startsWith(p))) {
      return send(res, 400, { error: `Riot path not allowed: "${path}".` })
    }

    const key = process.env.RIOT_API_KEY
    if (!key) {
      return send(res, 500, {
        error: 'RIOT_API_KEY is not set on the server. Add it to .env (local) or the Vercel project settings.',
      })
    }

    const target = `https://${routing}.api.riotgames.com${path}`
    const riotRes = await fetch(target, { headers: { 'X-Riot-Token': key } })
    const text = await riotRes.text()
    const data = text ? safeJson(text) : null

    const headers: Record<string, string> = {}
    // Completed matches are immutable - let the CDN cache them hard.
    if (riotRes.ok && /^\/lol\/match\/v5\/matches\/[A-Za-z0-9_]+$/.test(path)) {
      headers['cache-control'] = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
    }
    // Pass Riot's back-off hint through so the client can honour it.
    const retryAfter = riotRes.headers.get('retry-after')
    if (retryAfter) headers['retry-after'] = retryAfter

    if (!riotRes.ok) {
      return send(
        res,
        riotRes.status,
        { error: riotErrorMessage(riotRes.status), status: riotRes.status, riot: data },
        headers,
      )
    }
    return send(res, 200, data, headers)
  } catch (err) {
    return send(res, 502, { error: 'Upstream request to Riot failed.', detail: String(err) })
  }
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(JSON.stringify(body))
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function riotErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Bad request to the Riot API.'
    case 401:
      return 'Riot API key missing or malformed.'
    case 403:
      return 'Riot API key is invalid or expired. Development keys last 24 hours - generate a new one and update RIOT_API_KEY.'
    case 404:
      return 'Not found.'
    case 429:
      return 'Rate limited by Riot. Wait a moment and try again.'
    case 500:
    case 502:
    case 503:
    case 504:
      return 'The Riot API is temporarily unavailable.'
    default:
      return `Riot API error (${status}).`
  }
}
