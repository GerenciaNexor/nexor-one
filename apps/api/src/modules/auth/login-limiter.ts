/**
 * In-memory IP-based login abuse tracker.
 * After MAX_FAILURES consecutive failed login attempts within FAILURE_WINDOW_MS,
 * the IP is blocked for BLOCK_DURATION_MS. Entries are cleaned up every 10 minutes.
 */

const MAX_FAILURES      = 5
const BLOCK_DURATION_MS = 15 * 60 * 1000   // 15 minutes
const FAILURE_WINDOW_MS = 15 * 60 * 1000   // sliding window

interface IPEntry {
  count:          number
  firstAttemptAt: number
  blockedUntil?:  number
}

const store = new Map<string, IPEntry>()

setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of store) {
    const expired = entry.blockedUntil
      ? now > entry.blockedUntil
      : now - entry.firstAttemptAt > FAILURE_WINDOW_MS
    if (expired) store.delete(ip)
  }
}, 10 * 60 * 1000).unref()

export function isIPBlocked(ip: string): boolean {
  const entry = store.get(ip)
  if (!entry?.blockedUntil) return false
  if (Date.now() < entry.blockedUntil) return true
  store.delete(ip)
  return false
}

export function getBlockedUntil(ip: string): number | undefined {
  return store.get(ip)?.blockedUntil
}

export function recordFailedAttempt(ip: string): void {
  const now   = Date.now()
  const entry = store.get(ip)

  if (!entry) {
    store.set(ip, { count: 1, firstAttemptAt: now })
    return
  }

  // Reset window if too old
  if (now - entry.firstAttemptAt > FAILURE_WINDOW_MS) {
    store.set(ip, { count: 1, firstAttemptAt: now })
    return
  }

  const newCount = entry.count + 1
  if (newCount >= MAX_FAILURES) {
    store.set(ip, { count: newCount, firstAttemptAt: entry.firstAttemptAt, blockedUntil: now + BLOCK_DURATION_MS })
  } else {
    store.set(ip, { count: newCount, firstAttemptAt: entry.firstAttemptAt })
  }
}

export function clearFailedAttempts(ip: string): void {
  store.delete(ip)
}
