import { useEffect, useState } from 'react'

const COOLDOWN_MS = 60_000
const STORAGE_KEY = 'lastUpdateAt'

// Stored in localStorage so the cooldown survives the reload it triggers.
function readLastUpdate(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

function remainingMs(): number {
  return Math.max(0, readLastUpdate() + COOLDOWN_MS - Date.now())
}

/** Reloads the page (and all its data), at most once a minute. */
export function UpdateButton() {
  const [remaining, setRemaining] = useState(remainingMs)

  useEffect(() => {
    if (remaining <= 0) return
    const t = setTimeout(() => setRemaining(remainingMs()), 1000)
    return () => clearTimeout(t)
  }, [remaining])

  const onClick = () => {
    if (remainingMs() > 0) return
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      // No storage - still reload, just without a persisted cooldown.
    }
    window.location.reload()
  }

  const secs = Math.ceil(remaining / 1000)
  return (
    <button
      type="button"
      className="update-btn"
      disabled={remaining > 0}
      title={remaining > 0 ? `You can update again in ${secs}s` : 'Refresh this player\'s data'}
      onClick={onClick}
    >
      {remaining > 0 ? `Update (${secs}s)` : '↻ Update'}
    </button>
  )
}
