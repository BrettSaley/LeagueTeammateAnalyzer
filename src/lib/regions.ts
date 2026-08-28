export interface Region {
  code: string
  label: string
  /** Platform host - spectator, league, summoner endpoints. */
  platform: string
  /** Regional host - match endpoints. */
  regional: string
  /** Regional host for account-v1 (only americas/asia/europe are valid). */
  account: string
}

export const REGIONS: Region[] = [
  { code: 'NA', label: 'North America', platform: 'na1', regional: 'americas', account: 'americas' },
  { code: 'EUW', label: 'EU West', platform: 'euw1', regional: 'europe', account: 'europe' },
  { code: 'EUNE', label: 'EU Nordic & East', platform: 'eun1', regional: 'europe', account: 'europe' },
  { code: 'KR', label: 'Korea', platform: 'kr', regional: 'asia', account: 'asia' },
  { code: 'BR', label: 'Brazil', platform: 'br1', regional: 'americas', account: 'americas' },
  { code: 'LAN', label: 'Latin America North', platform: 'la1', regional: 'americas', account: 'americas' },
  { code: 'LAS', label: 'Latin America South', platform: 'la2', regional: 'americas', account: 'americas' },
  { code: 'OCE', label: 'Oceania', platform: 'oc1', regional: 'sea', account: 'americas' },
  { code: 'JP', label: 'Japan', platform: 'jp1', regional: 'asia', account: 'asia' },
  { code: 'TR', label: 'Turkiye', platform: 'tr1', regional: 'europe', account: 'europe' },
  { code: 'RU', label: 'Russia', platform: 'ru', regional: 'europe', account: 'europe' },
]

export function getRegion(code: string): Region {
  return REGIONS.find((r) => r.code === code) ?? REGIONS[0]
}
