import type { Ddragon } from '../lib/ddragon'
import {
  CONFIG,
  labelForRawScore,
  rankComparisonText,
  rankName,
  type GameScore,
  type Parts,
  type PlayerRating,
} from '../lib/rating'

interface Props {
  name: string
  tag?: string
  rating: PlayerRating | null
  dd: Ddragon | null
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** The searched player's own rating, with a factor-by-factor breakdown. */
export function PlayerScorecard({ name, tag, rating, dd }: Props) {
  const rated = rating && rating.games > 0

  return (
    <section className="scorecard">
      <div className="scorecard-head">
        <div className="who">
          <span className="name">
            {name || 'You'}
            {tag && <span className="tag">#{tag}</span>}
          </span>
          <span className="muted small">
            {rated
              ? `graded vs ${rankName(rating!.rankTier) ?? 'unranked (Gold)'} · last ${rating!.games} ranked games`
              : `graded on your last ${CONFIG.selfMaxGames} ranked games`}
          </span>
        </div>
        <span className="rating" data-tier={rated ? rating!.label : 'unrated'}>
          {rated ? rating!.label : 'unrated'}
        </span>
      </div>

      {rating === null && <p className="muted small">Working out your rating…</p>}

      {rating && !rated && (
        <p className="muted small">No ranked games in recent history to break down.</p>
      )}

      {rated && (
        <>
          <p className="scorecard-verdict">Playing {rankComparisonText(rating!)}</p>

          <div className="factors">
            {factorRows(rating!).map((f) => (
              <div className="factor" data-level={f.level} key={f.key}>
                <span className="factor-label">{f.label}</span>
                <span className="factor-value">{f.value}</span>
                <span className="factor-bar">
                  <span style={{ width: `${Math.round(Math.min(1, f.sub) * 100)}%` }} />
                </span>
                <span className="factor-points">+{f.points.toFixed(0)}</span>
              </div>
            ))}
            <div className="factor total">
              <span className="factor-label">Raw score</span>
              <span className="factor-value">{rating!.score}/100</span>
              <span className="factor-bar" />
              <span className="factor-points" />
            </div>
          </div>

          <div className="game-pips">
            <span className="muted small">per game</span>
            {rating!.breakdown.map((g) => (
              <span
                key={g.matchId}
                className={`pip ${g.win ? 'win' : 'loss'}`}
                title={`${g.win ? 'Win' : 'Loss'} · score ${g.score}`}
              >
                {g.score}
              </span>
            ))}
          </div>

          <div className="scale-track">
            <span
              className="scale-marker"
              style={{ left: `${Math.max(2, Math.min(98, rating!.adjusted))}%` }}
            >
              <span className="scale-marker-value">{rating!.label}</span>
            </span>
            <div className="scale-bar">
              {CONFIG.tiers.map((t, i) => {
                const upper = CONFIG.tiers[i + 1]?.min ?? 100
                return (
                  <span
                    key={t.label}
                    className="scale-seg"
                    data-tier={t.label}
                    style={{ width: `${upper - t.min}%` }}
                  >
                    {t.label}
                  </span>
                )
              })}
            </div>
            <div className="scale-caption muted small">
              rank-adjusted — 50 = playing at your rank
            </div>
          </div>

          <div className="champ-stats">
            <span className="muted small">by champion</span>
            {champStats(rating!.breakdown).map((c) => {
              const icon = dd?.championIcon(c.id) || ''
              return (
                <div className="champ-stat" key={c.name}>
                  {icon ? (
                    <img src={icon} alt="" loading="lazy" />
                  ) : (
                    <span className="champ-ic-ph" />
                  )}
                  <span className="champ-name">{c.name}</span>
                  <span className="muted">
                    {c.wins}W {c.games - c.wins}L
                  </span>
                  <span>{c.kda.toFixed(1)} KDA</span>
                  <span className="champ-cs">{c.csPerMin.toFixed(1)} cs/m</span>
                  <span className="champ-score">{Math.round(c.score)}</span>
                  <span
                    className="rating"
                    data-tier={labelForRawScore(c.score, rating!.rankTier)}
                  >
                    {labelForRawScore(c.score, rating!.rankTier)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

interface ChampStat {
  name: string
  id: number
  games: number
  wins: number
  score: number
  kda: number
  csPerMin: number
}

function champStats(games: GameScore[]): ChampStat[] {
  const acc = new Map<
    string,
    { id: number; games: number; wins: number; score: number; kda: number; csPerMin: number }
  >()
  for (const g of games) {
    const e =
      acc.get(g.championName) ??
      { id: g.championId, games: 0, wins: 0, score: 0, kda: 0, csPerMin: 0 }
    e.games += 1
    e.wins += g.win ? 1 : 0
    e.score += g.score
    e.kda += g.kda
    e.csPerMin += g.csPerMin
    acc.set(g.championName, e)
  }
  return [...acc.entries()]
    .map(([name, e]) => ({
      name,
      id: e.id,
      games: e.games,
      wins: e.wins,
      score: e.score / e.games,
      kda: e.kda / e.games,
      csPerMin: e.csPerMin / e.games,
    }))
    .sort((a, b) => b.games - a.games || b.score - a.score)
}

function factorLevel(sub: number): 'good' | 'ok' | 'poor' {
  return sub >= 0.62 ? 'good' : sub >= 0.38 ? 'ok' : 'poor'
}

function factorRows(r: PlayerRating) {
  const w = CONFIG.weights
  const row = (key: keyof Parts, label: string, value: string) => ({
    key,
    label,
    value,
    sub: r.avgParts[key],
    level: factorLevel(r.avgParts[key]),
    points: r.avgParts[key] * w[key] * 100,
  })
  return [
    row('kda', 'KDA', r.avg.kda.toFixed(1)),
    row('kp', 'Kill participation', pct(r.avg.killParticipation)),
    row(
      'farm',
      r.farmIsVision ? 'Vision / min' : 'CS / min',
      (r.farmIsVision ? r.avg.visionPerMin : r.avg.csPerMin).toFixed(1),
    ),
    row('gold', 'Gold / min', Math.round(r.avg.goldPerMin).toString()),
    row('damage', 'Damage share', pct(r.avg.damageShare)),
  ]
}
