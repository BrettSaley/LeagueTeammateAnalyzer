import { useEffect, useState } from 'react'
import { ApiError, getActiveGame, getRankByPuuid } from '../lib/api'
import { queueName } from '../lib/queues'
import type { Ddragon } from '../lib/ddragon'
import type { BannedChampion, CurrentGameInfo, CurrentGameParticipant } from '../lib/types'
import type { PlayerRating } from '../lib/rating'
import { ratingKey, usePlayerRatings } from '../hooks/usePlayerRatings'
import { PlayerRow } from './PlayerRow'

type RatingOf = (puuid: string) => PlayerRating | null | undefined

interface Props {
  region: string
  puuid: string
  dd: Ddragon | null
  onPickPlayer: (riotId: string) => void
}

type Status = 'loading' | 'not-in-game' | 'ok' | 'error'

export function LiveGame({ region, puuid, dd, onPickPlayer }: Props) {
  const [game, setGame] = useState<CurrentGameInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [ranks, setRanks] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)
    setGame(null)
    setRanks({})

    getActiveGame(region, puuid)
      .then((g) => {
        if (cancelled) return
        setGame(g)
        setStatus('ok')
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setStatus('not-in-game')
        } else {
          setStatus('error')
          setError(err instanceof ApiError ? err.message : String(err))
        }
      })

    return () => {
      cancelled = true
    }
  }, [region, puuid])

  useEffect(() => {
    if (!game) return
    let cancelled = false

    Promise.all(
      game.participants.map(async (pt) => {
        try {
          const entries = await getRankByPuuid(region, pt.puuid)
          const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5') ?? entries[0]
          const label = solo
            ? `${title(solo.tier)} ${solo.rank} - ${solo.leaguePoints} LP`
            : 'Unranked'
          return [pt.puuid, label] as const
        } catch {
          return [pt.puuid, ''] as const
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setRanks(Object.fromEntries(pairs))
    })

    return () => {
      cancelled = true
    }
  }, [game, region])

  // Ratings for all 10 players from their recent ranked games.
  const ratingReqs = game ? game.participants.map((p) => ({ puuid: p.puuid })) : []
  const ratings = usePlayerRatings(region, ratingReqs)
  const ratingOf: RatingOf = (pu) => ratings.get(ratingKey(pu)) ?? null

  if (status === 'loading') return <p className="muted">Checking for a live game...</p>
  if (status === 'error') return <div className="error">{error}</div>
  if (status === 'not-in-game')
    return <p className="muted">Not in a game right now. Try the Match History tab.</p>
  if (!game) return null

  const me = game.participants.find((p) => p.puuid === puuid)
  const myTeam = me?.teamId ?? 100
  const allies = game.participants.filter((p) => p.teamId === myTeam)
  const enemies = game.participants.filter((p) => p.teamId !== myTeam)

  return (
    <div className="live">
      <div className="game-meta">
        <span>{queueName(game.gameQueueConfigId)}</span>
        <span>{game.gameMode}</span>
        {game.gameStartTime > 0 ? (
          <Elapsed since={game.gameStartTime} />
        ) : (
          <span>In champ select / loading</span>
        )}
      </div>

      <Team
        title="Your team"
        players={allies}
        puuid={puuid}
        dd={dd}
        ranks={ranks}
        ratingOf={ratingOf}
        onPickPlayer={onPickPlayer}
        bans={game.bannedChampions.filter((b) => b.teamId === myTeam)}
      />
      <Team
        title="Enemy team"
        players={enemies}
        puuid={puuid}
        dd={dd}
        ranks={ranks}
        ratingOf={ratingOf}
        onPickPlayer={onPickPlayer}
        bans={game.bannedChampions.filter((b) => b.teamId !== myTeam)}
      />
    </div>
  )
}

function Team({
  title: heading,
  players,
  puuid,
  dd,
  ranks,
  ratingOf,
  onPickPlayer,
  bans,
}: {
  title: string
  players: CurrentGameParticipant[]
  puuid: string
  dd: Ddragon | null
  ranks: Record<string, string>
  ratingOf: RatingOf
  onPickPlayer: (riotId: string) => void
  bans: BannedChampion[]
}) {
  const visibleBans = bans.filter((b) => b.championId > 0)
  return (
    <section className="team">
      <h3>{heading}</h3>
      {visibleBans.length > 0 && dd && (
        <div className="bans">
          <span className="muted">Bans</span>
          {visibleBans.map((b, i) => (
            <img key={i} src={dd.championIcon(b.championId)} alt="" title="Banned" />
          ))}
        </div>
      )}
      {players.map((p) => {
        const [name, tag] = splitRiotId(p.riotId)
        return (
          <PlayerRow
            key={p.puuid}
            dd={dd}
            championId={p.championId}
            name={name}
            tag={tag}
            spellIds={[p.spell1Id, p.spell2Id]}
            runeIds={p.perks ? [p.perks.perkIds[0], p.perks.perkSubStyle] : undefined}
            rank={ranks[p.puuid]}
            rating={ratingOf(p.puuid)}
            onPick={tag ? () => onPickPlayer(`${name}#${tag}`) : undefined}
            isSelf={p.puuid === puuid}
          />
        )
      })}
    </section>
  )
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <span>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

function splitRiotId(riotId: string | undefined): [string, string | undefined] {
  if (!riotId) return ['Unknown', undefined]
  const i = riotId.lastIndexOf('#')
  return i === -1 ? [riotId, undefined] : [riotId.slice(0, i), riotId.slice(i + 1)]
}

function title(s: string): string {
  return s ? s[0] + s.slice(1).toLowerCase() : s
}
