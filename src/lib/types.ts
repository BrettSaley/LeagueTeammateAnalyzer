/** Subset of Riot API response shapes that this app actually reads. */

export interface AccountDto {
  puuid: string
  gameName: string
  tagLine: string
}

export interface Perks {
  perkIds: number[]
  perkStyle: number
  perkSubStyle: number
}

export interface CurrentGameParticipant {
  puuid: string
  teamId: number
  spell1Id: number
  spell2Id: number
  championId: number
  profileIconId: number
  riotId: string
  bot: boolean
  perks?: Perks
}

export interface BannedChampion {
  championId: number
  teamId: number
  pickTurn: number
}

export interface CurrentGameInfo {
  gameId: number
  gameStartTime: number
  gameLength: number
  gameMode: string
  gameType: string
  gameQueueConfigId: number
  mapId: number
  platformId: string
  bannedChampions: BannedChampion[]
  participants: CurrentGameParticipant[]
}

export interface LeagueEntryDto {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

export interface MatchParticipant {
  puuid: string
  teamId: number
  win: boolean
  championId: number
  championName: string
  summonerName: string
  riotIdGameName?: string
  /** Older matches used this field name. */
  riotIdName?: string
  riotIdTagline?: string
  kills: number
  deaths: number
  assists: number
  summoner1Id: number
  summoner2Id: number
  teamPosition: string

  // Performance stats used by the rating model.
  goldEarned?: number
  totalMinionsKilled?: number
  neutralMinionsKilled?: number
  totalDamageDealtToChampions?: number
  visionScore?: number
  /** Riot's precomputed derived stats; absent on some older matches / queues. */
  challenges?: {
    kda?: number
    killParticipation?: number
    goldPerMinute?: number
    teamDamagePercentage?: number
  }
}

export interface MatchInfo {
  gameCreation: number
  gameDuration: number
  gameEndTimestamp?: number
  gameMode: string
  queueId: number
  participants: MatchParticipant[]
}

export interface MatchDto {
  metadata: { matchId: string; participants: string[] }
  info: MatchInfo
}
