import type { Ddragon } from '../lib/ddragon'
import { ratingTooltip, type PlayerRating } from '../lib/rating'

interface Props {
  dd: Ddragon | null
  championId?: number
  championName?: string
  name: string
  tag?: string
  spellIds?: [number, number]
  /** [keystone rune id, secondary style id] */
  runeIds?: [number, number]
  rank?: string
  kda?: { k: number; d: number; a: number }
  isSelf?: boolean
  timesPlayed?: number
  /** undefined = not requested, null = loading, otherwise the rating. */
  rating?: PlayerRating | null
}

export function PlayerRow(p: Props) {
  const champ = p.championId ?? p.championName ?? ''
  const champUrl = p.dd ? p.dd.championIcon(champ) : ''

  return (
    <div className={`player-row${p.isSelf ? ' self' : ''}`}>
      {champUrl ? (
        <img className="champ" src={champUrl} alt={p.championName ?? ''} loading="lazy" />
      ) : (
        <div className="champ placeholder" />
      )}

      {p.spellIds && p.dd && (
        <div className="icons">
          <img src={p.dd.spellIcon(p.spellIds[0])} alt="" />
          <img src={p.dd.spellIcon(p.spellIds[1])} alt="" />
        </div>
      )}
      {p.runeIds && p.dd && (
        <div className="icons">
          <img className="rune" src={p.dd.runeIcon(p.runeIds[0])} alt="" />
          <img className="rune" src={p.dd.runeIcon(p.runeIds[1])} alt="" />
        </div>
      )}

      <div className="who">
        <span className="name">
          {p.name}
          {p.tag && <span className="tag">#{p.tag}</span>}
        </span>
        {p.rank && <span className="rank">{p.rank}</span>}
      </div>

      <Rating rating={p.rating} />

      {p.kda && (
        <span className="kda">
          {p.kda.k}/{p.kda.d}/{p.kda.a}
        </span>
      )}
      {typeof p.timesPlayed === 'number' && p.timesPlayed > 1 && (
        <span className="together">{p.timesPlayed} games together</span>
      )}
    </div>
  )
}

function Rating({ rating }: { rating?: PlayerRating | null }) {
  if (rating === undefined) return null
  if (rating === null) return <span className="rating pending">rating…</span>
  return (
    <span className="rating" data-tier={rating.label} title={ratingTooltip(rating)}>
      {rating.label}
    </span>
  )
}
