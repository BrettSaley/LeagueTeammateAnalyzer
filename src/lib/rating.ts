import type { MatchDto } from './types'

/**
 * Player performance rating.
 *
 * Each recent game is scored 0-100 from a weighted blend of performance
 * indicators; the last few games are averaged into a raw score. That raw score
 * is then *adjusted for the player's rank* - re-centred so that playing at the
 * level expected of their rank sits at 50 - and the adjusted score is bucketed
 * into a descriptive label. So the label always means "for their rank": a
 * Silver holding their own vs Silvers reads "Competent", not "Diamond".
 * Everything is driven by CONFIG / RANKS below.
 */

export type Label = 'Inter' | 'Useless' | 'Competent' | 'Gamer' | '1v9' | 'unrated'

/**
 * Rank ladder, worst to best. `expected` is the raw score a player performing
 * exactly at that rank's level is assumed to produce - calibrated so an average
 * Gold game lands ~45. Tune these to shift how harsh each rank's bar is.
 */
export const RANKS: { key: string; name: string; expected: number }[] = [
  { key: 'IRON', name: 'Iron', expected: 33 },
  { key: 'BRONZE', name: 'Bronze', expected: 37 },
  { key: 'SILVER', name: 'Silver', expected: 41 },
  { key: 'GOLD', name: 'Gold', expected: 45 },
  { key: 'PLATINUM', name: 'Platinum', expected: 49 },
  { key: 'EMERALD', name: 'Emerald', expected: 53 },
  { key: 'DIAMOND', name: 'Diamond', expected: 58 },
  { key: 'MASTER', name: 'Master', expected: 63 },
  { key: 'GRANDMASTER', name: 'Grandmaster', expected: 66 },
  { key: 'CHALLENGER', name: 'Challenger', expected: 69 },
]

export const CONFIG = {
  /**
   * How many ranked games feed a rating. In Match History these are the games
   * played *before* the match being viewed (a player's form going into it);
   * in Live Game they're the most recent games. Higher = steadier but more
   * API calls (~2 + maxGames per rated player).
   */
  maxGames: 5,
  /** Games used for the searched player's own scorecard (a bigger sample). */
  selfMaxGames: 10,
  /** Games shorter than this (minutes) are remakes - ignored. */
  minDurationMin: 5,
  /** Only these queues are rated: 420 = Ranked Solo/Duo, 440 = Ranked Flex. */
  rankedQueues: [420, 440],

  /** Rank to anchor to when the player is unranked / rank lookup fails. */
  defaultRank: 'GOLD',

  /**
   * Descriptive tiers on the *rank-adjusted* 0-100 score (50 = playing exactly
   * at your rank's level). `min` is the inclusive lower bound.
   */
  tiers: [
    { label: 'Inter', min: 0 },
    { label: 'Useless', min: 30 },
    { label: 'Competent', min: 46 },
    { label: 'Gamer', min: 56 },
    { label: '1v9', min: 73 },
  ] as { label: Label; min: number }[],

  /**
   * Maps a raw stat to a 0..1 sub-score (before clamping).
   * Denominators are calibrated so a roughly average Gold/Plat game lands ~0.45.
   */
  curves: {
    kda: (v: number) => v / 6, //  6.0 KDA  -> 1.0
    kp: (v: number) => (v - 0.2) / 0.6, //  80% kill participation -> 1.0
    csPerMin: (v: number) => (v - 2) / 9, //  11 cs/min -> 1.0
    visionPerMin: (v: number) => (v - 0.4) / 2.0, //  supports: vision instead of cs
    goldPerMin: (v: number) => (v - 250) / 260, //  ~510 gold/min -> 1.0
    damageShare: (v: number) => (v - 0.05) / 0.3, //  35% of team damage -> 1.0
  },

  /** Sub-score weights for non-support games. Must sum to 1. */
  weights: { kda: 0.28, kp: 0.22, farm: 0.18, gold: 0.16, damage: 0.16 },

  /**
   * Support games: no CS/min, no gold/min. Here `farm` is vision/min - weighted
   * heavily - and damage share barely counts. Must sum to 1.
   */
  supportWeights: { kda: 0.3, kp: 0.32, farm: 0.32, damage: 0.06 },
}

/** Per-factor 0..1 sub-scores (post-clamp), before weighting. */
export interface Parts {
  kda: number
  kp: number
  farm: number
  gold: number
  damage: number
}

export interface GameScore {
  matchId: string
  queueId: number
  championId: number
  championName: string
  win: boolean
  score: number
  kda: number
  csPerMin: number
  visionPerMin: number
  goldPerMin: number
  killParticipation: number
  damageShare: number
  isSupport: boolean
  parts: Parts
}

export interface PlayerRating {
  /** Descriptive grade on the rank-adjusted scale, or "unrated". */
  label: Label
  /** Raw 0-100 performance score, before the rank adjustment. */
  score: number
  /** Raw score re-centred for the player's rank (50 = playing at their rank). */
  adjusted: number
  /** The player's actual solo/flex rank tier key (e.g. "DIAMOND"), or null. */
  rankTier: string | null
  games: number
  breakdown: GameScore[]
  /** True when most rated games were support (uses the support weight profile). */
  isSupport: boolean
  avg: {
    kda: number
    csPerMin: number
    visionPerMin: number
    goldPerMin: number
    killParticipation: number
    damageShare: number
  }
  /** Averaged sub-scores - each * its weight * 100 = its contribution to `score`. */
  avgParts: Parts
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
const div = (a: number, b: number): number => (b > 0 ? a / b : 0)
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

const clampScore = (n: number): number => (n < 0 ? 0 : n > 100 ? 100 : n)

/** Weights actually applied to a game - a separate profile for support games. */
export function effectiveWeights(isSupport: boolean): Partial<Record<keyof Parts, number>> {
  return isSupport ? CONFIG.supportWeights : CONFIG.weights
}

const rankAnchor = (key: string | null): { key: string; name: string; expected: number } => {
  const i = RANKS.findIndex((r) => r.key === key)
  return i === -1 ? RANKS.find((r) => r.key === CONFIG.defaultRank)! : RANKS[i]
}

/** Re-centre a raw score for the player's rank: 50 = playing at their rank's level. */
export function adjustForRank(score: number, rankTier: string | null): number {
  return Math.round(clampScore(50 + (score - rankAnchor(rankTier).expected)))
}

function labelForAdjusted(adjusted: number): Label {
  let label: Label = CONFIG.tiers[0].label
  for (const t of CONFIG.tiers) if (adjusted >= t.min) label = t.label
  return label
}

/** Descriptive label for a raw 0-100 score, rank-adjusted for `rankTier`. */
export function labelForRawScore(rawScore: number, rankTier: string | null): Label {
  return labelForAdjusted(adjustForRank(rawScore, rankTier))
}

/** Score a single match for one player, or null if the game should be skipped. */
export function scoreGame(match: MatchDto, puuid: string): GameScore | null {
  const p = match.info.participants.find((x) => x.puuid === puuid)
  if (!p) return null

  const durationMin =
    (match.info.gameDuration > 10000 ? match.info.gameDuration / 1000 : match.info.gameDuration) / 60
  const queueId = match.info.queueId
  if (durationMin < CONFIG.minDurationMin) return null
  if (!CONFIG.rankedQueues.includes(queueId)) return null

  const isSupport = (p.teamPosition || '').toUpperCase() === 'UTILITY'

  const team = match.info.participants.filter((x) => x.teamId === p.teamId)
  const teamKills = team.reduce((s, x) => s + x.kills, 0)
  const teamDamage = team.reduce((s, x) => s + (x.totalDamageDealtToChampions ?? 0), 0)

  const ch = p.challenges ?? {}
  const kda = ch.kda ?? div(p.kills + p.assists, Math.max(1, p.deaths))
  const killParticipation = ch.killParticipation ?? clamp01(div(p.kills + p.assists, teamKills))
  const cs = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0)
  const csPerMin = div(cs, durationMin)
  const goldPerMin = ch.goldPerMinute ?? div(p.goldEarned ?? 0, durationMin)
  const damageShare =
    ch.teamDamagePercentage ?? clamp01(div(p.totalDamageDealtToChampions ?? 0, teamDamage))
  const visionPerMin = div(p.visionScore ?? 0, durationMin)

  const c = CONFIG.curves
  const parts: Parts = {
    kda: clamp01(c.kda(kda)),
    kp: clamp01(c.kp(killParticipation)),
    // `farm` is vision/min for supports, CS/min otherwise.
    farm: clamp01(isSupport ? c.visionPerMin(visionPerMin) : c.csPerMin(csPerMin)),
    gold: clamp01(c.goldPerMin(goldPerMin)),
    damage: clamp01(c.damageShare(damageShare)),
  }

  const w = effectiveWeights(isSupport)
  let score = 0
  for (const key of Object.keys(w) as (keyof Parts)[]) score += (w[key] ?? 0) * parts[key]

  return {
    matchId: match.metadata.matchId,
    queueId,
    championId: p.championId,
    championName: p.championName,
    win: p.win,
    score: Math.round(clamp01(score) * 100),
    kda,
    csPerMin,
    visionPerMin,
    goldPerMin,
    killParticipation,
    damageShare,
    isSupport,
    parts,
  }
}

export function ratePlayer(
  games: GameScore[],
  rankTier: string | null = null,
  maxGames: number = CONFIG.maxGames,
): PlayerRating {
  const used = games.slice(0, maxGames)
  if (used.length === 0) {
    const zeroParts: Parts = { kda: 0, kp: 0, farm: 0, gold: 0, damage: 0 }
    return {
      label: 'unrated',
      score: 0,
      adjusted: 0,
      rankTier,
      games: 0,
      breakdown: [],
      isSupport: false,
      avg: {
        kda: 0,
        csPerMin: 0,
        visionPerMin: 0,
        goldPerMin: 0,
        killParticipation: 0,
        damageShare: 0,
      },
      avgParts: zeroParts,
    }
  }

  const score = Math.round(mean(used.map((g) => g.score)))
  const adjusted = adjustForRank(score, rankTier)
  const label = labelForAdjusted(adjusted)
  const part = (k: keyof Parts) => mean(used.map((g) => g.parts[k]))

  return {
    label,
    score,
    adjusted,
    rankTier,
    games: used.length,
    breakdown: used,
    isSupport: used.filter((g) => g.isSupport).length > used.length / 2,
    avg: {
      kda: mean(used.map((g) => g.kda)),
      csPerMin: mean(used.map((g) => g.csPerMin)),
      visionPerMin: mean(used.map((g) => g.visionPerMin)),
      goldPerMin: mean(used.map((g) => g.goldPerMin)),
      killParticipation: mean(used.map((g) => g.killParticipation)),
      damageShare: mean(used.map((g) => g.damageShare)),
    },
    avgParts: {
      kda: part('kda'),
      kp: part('kp'),
      farm: part('farm'),
      gold: part('gold'),
      damage: part('damage'),
    },
  }
}

export function rankName(key: string | null): string | null {
  return RANKS.find((r) => r.key === key)?.name ?? null
}

/** "for a Gold" / "vs Diamond (unranked)" - what the grade is measured against. */
export function rankAnchorText(r: PlayerRating): string {
  const name = rankName(r.rankTier)
  return name ? `for ${name === 'Iron' || name === 'Emerald' ? 'an' : 'a'} ${name}` : 'for their rank'
}

/** "right around Gold level" / "above Gold level" / "well below Gold level". */
export function rankComparisonText(r: PlayerRating): string {
  const d = r.adjusted - 50
  const anchor = rankName(r.rankTier)
  const at = anchor ? `${anchor} level` : 'the level for their rank'
  if (Math.abs(d) < 8) return `right around ${at}`
  const dir = d > 0 ? 'above' : 'below'
  return `${Math.abs(d) < 22 ? '' : 'well '}${dir} ${at}`
}

export function ratingTooltip(r: PlayerRating): string {
  if (r.games === 0) return 'No recent ranked games to rate.'
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const span = r.games === 1 ? 'last ranked game' : `last ${r.games} ranked games`
  return [
    `${r.label} ${rankAnchorText(r)} — playing ${rankComparisonText(r)}`,
    `Raw score ${r.score}/100 · rank-adjusted ${r.adjusted}/100 · ${span}`,
    `KDA ${r.avg.kda.toFixed(1)} · ${r.avg.csPerMin.toFixed(1)} cs/min · ${Math.round(
      r.avg.goldPerMin,
    )} gold/min`,
    `KP ${pct(r.avg.killParticipation)} · dmg share ${pct(r.avg.damageShare)}`,
  ].join('\n')
}
