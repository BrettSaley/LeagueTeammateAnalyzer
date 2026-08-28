# Gainz's League Analyzer

A small React web app that uses the Riot Games League of Legends API to show
your **live game** (your team vs. the enemy team, with champions, summoner
spells, runes and ranks) and your **recent match history**, including a summary
of teammates you have queued with more than once.

## How it works

The Riot API sends no CORS headers and your API key must never reach the
browser, so all Riot requests go through a tiny serverless proxy
(`api/riot.ts`). It:

- accepts `?routing=<host>&path=<riot path>`,
- allows only a fixed list of Riot endpoints,
- injects the `X-Riot-Token` header from the `RIOT_API_KEY` environment variable,
- caches completed matches at the CDN (they never change).

Champion, summoner-spell and rune icons come from
[Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon), which is
static and needs no key.

### "Teammates" is derived, not an endpoint

Riot has no teammates endpoint. This app:

- **Live game** – calls SPECTATOR-V5, splits the 10 players by `teamId`, and
  labels the side you are on as *your team*.
- **Match history** – pulls your last 10 match IDs (MATCH-V5), loads each match,
  and counts every other player who was on your team. Anyone who appears on your
  team in 2+ of those games is listed under *Recent teammates* (your usual
  premades / duos).

### Player performance rating

Every player shown – all 10 in the live game, and every player row in Match
History – gets a badge (**Inter · Useless · Competent · Gamer · 1v9**) judged
*relative to their own rank*. It's the average of up to `maxGames` (default 5)
ranked games (queues 420 and 440 only; ARAM, normals, Arena and remakes are
ignored):

- **Live Game** – the player's most recent ranked games.
- **Match History** – automatic for just two things: the box at the top (your
  own current rating over your last `selfMaxGames` (10) ranked games, with a
  full factor breakdown) and the *Recent teammates* rows (`maxGames`). Individual
  matches are rated only when you press **Analyze** on them, which scores each of
  the 10 players on the ranked games they had played *before* that match (their
  form going in), via the MATCH-V5 `endTime` filter.

**Raw score.** Each game is scored 0–100 from a weighted blend:

| Indicator | Weight | Notes |
| --- | --- | --- |
| KDA | 28% | |
| Kill participation | 22% | |
| CS per minute | 18% | vision/min instead, for supports |
| Gold per minute | 16% | |
| Damage share of team | 16% | |

Win/loss is deliberately *not* an input – it's a team result, not individual
performance. Per-game W/L is still shown in the scorecard for context.

**Rank adjustment.** The averaged raw score is re-centred for the player's
actual solo/flex rank (from LEAGUE-V4): each rank has an `expected` raw score
(an average Gold game ≈ 45), and `adjusted = 50 + (raw − expected[rank])`. So
50 always means "playing at your rank's level", and the same raw stats land
**Gamer** for a Silver but **Useless** for a Diamond. Unranked players are
anchored to `defaultRank` (Gold). The adjusted score is bucketed by `CONFIG.tiers`:
`<30` Inter, `30–45` Useless, `46–55` Competent, `56–72` Gamer, `≥73` 1v9.

`RANKS` (`expected` per rank), `defaultRank`, `CONFIG.tiers`, the stat weights,
the curves and `maxGames` all live at the top of `src/lib/rating.ts`. Riot's
precomputed `challenges` stats are used when present, with manual fallbacks.

Rating one (player, reference time) costs ~`2 + maxGames` API calls (a match-id
lookup, a rank lookup, and each match), cached per session (rank is cached per
player). A fresh Match History costs ~`(1 + teammates) * (2 + maxGames)` up
front, and each **Analyze** adds ~`10 * (2 + maxGames)`.

The searched player's box shows the factor breakdown (green/red for strong/weak
factors), the tier bands with a marker at the rank-adjusted score, and a
per-champion split of the rated games (record, KDA, CS/min, avg score).

## Endpoints used

| Purpose | Endpoint | Host |
| --- | --- | --- |
| Riot ID → PUUID | `ACCOUNT-V1 /by-riot-id` | regional (americas/asia/europe) |
| Live game | `SPECTATOR-V5 /active-games/by-summoner` | platform (na1, euw1, …) |
| Match IDs | `MATCH-V5 /matches/by-puuid/{puuid}/ids` | regional |
| Match detail | `MATCH-V5 /matches/{matchId}` | regional |
| Ranks | `LEAGUE-V4 /entries/by-puuid` | platform |

## Local development

Requires Node 18+.

```bash
npm install
cp .env.example .env        # then paste your key into .env
npm run dev
```

Open http://localhost:5173. `npm run dev` serves both the React app and the
`/api/riot` proxy (via middleware in `vite.config.ts`) – no separate backend
process and no `vercel dev` needed.

## Deploying to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. In Vercel, **New Project → Import** the repo. The Vite framework preset is
   detected automatically; `api/riot.ts` is deployed as a serverless function.
3. **Project → Settings → Environment Variables**: add `RIOT_API_KEY` for the
   Production (and Preview) environments.
4. Deploy. Share the `*.vercel.app` URL with your friends.

### Daily key rotation

Riot **development** keys expire every 24 hours. Each day:

1. Sign in at <https://developer.riotgames.com/>, click **Regenerate API Key**.
2. In Vercel, update the `RIOT_API_KEY` env var and **redeploy** (Deployments →
   ⋯ → Redeploy, or push any commit). Env changes only take effect on a new
   deployment.

When the key lapses the app shows: *"Riot API key is invalid or expired."*

To avoid the daily redeploy later, apply for a **personal / production API key**
in the Riot developer portal, or move the key into
[Vercel Edge Config](https://vercel.com/docs/storage/edge-config) (editable
without a redeploy) and read it in `api/_handler.ts`.

## Project layout

```
api/
  _handler.ts      shared proxy logic (allow-list + key injection)
  riot.ts          Vercel function entry
src/
  App.tsx          search box, account lookup, tab switching
  components/
    SearchBar.tsx
    LiveGame.tsx    SPECTATOR-V5 view
    MatchHistory.tsx MATCH-V5 view + teammate aggregation
    PlayerRow.tsx
  hooks/useDdragon.ts
  lib/
    api.ts         typed client for /api/riot
    ddragon.ts     Data Dragon loader (icons / names)
    regions.ts     region → platform/regional/account host mapping
    queues.ts      queue id → name
    types.ts
vite.config.ts     Vite + dev-mode API middleware
```

## Notes / limits

- A shared development key is rate limited (20 req/s, 100 req/2 min). Loading the
  match history is ~11 requests; fine for a handful of users.
- `LEAGUE-V4 /entries/by-puuid` is used for live-game ranks and is best-effort –
  if it fails, rows just show no rank.
- This project is not endorsed by Riot Games and does not reflect their views.
