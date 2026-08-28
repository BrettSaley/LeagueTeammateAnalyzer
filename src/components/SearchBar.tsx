import { useEffect, useState } from 'react'
import { REGIONS } from '../lib/regions'

interface Props {
  riotId: string
  region: string
  onSearch: (riotId: string, region: string) => void
}

export function SearchBar({ riotId, region, onSearch }: Props) {
  const [value, setValue] = useState(riotId)
  const [reg, setReg] = useState(region)

  useEffect(() => setValue(riotId), [riotId])
  useEffect(() => setReg(region), [region])

  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSearch(value.trim(), reg)
      }}
    >
      <input
        placeholder="Riot ID   e.g.   Faker#KR1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        spellCheck={false}
        autoComplete="off"
      />
      <select value={reg} onChange={(e) => setReg(e.target.value)} aria-label="Region">
        {REGIONS.map((r) => (
          <option key={r.code} value={r.code}>
            {r.code}
          </option>
        ))}
      </select>
      <button type="submit">Search</button>
    </form>
  )
}
