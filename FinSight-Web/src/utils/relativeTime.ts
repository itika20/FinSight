/**
 * relativeTime — converts an ISO timestamp to a human-readable relative string.
 *
 * Examples:
 *   "Just now"        — < 1 minute ago
 *   "5 minutes ago"   — < 1 hour ago
 *   "2 hours ago"     — < 1 day ago
 *   "2 days ago"      — < 1 week ago
 *   "Last week"       — 7–13 days ago
 *   "3 weeks ago"     — 14–27 days ago
 *   "Last month"      — 28–59 days ago
 *   "3 months ago"    — 60 days – 11 months ago
 *   "12 Jan 2024"     — ≥ 1 year ago (en-IN locale)
 */
export function relativeTime(timestamp: string): string {
  const now    = Date.now()
  const then   = new Date(timestamp).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours   = Math.floor(diffMs / (1000 * 60 * 60))
  const days    = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const weeks   = Math.floor(days / 7)
  const months  = Math.floor(days / 30)
  const years   = Math.floor(days / 365)

  if (minutes < 1)   return 'Just now'
  if (minutes < 60)  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  if (hours   < 24)  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  if (days    < 7)   return `${days} ${days === 1 ? 'day' : 'days'} ago`
  if (days    < 14)  return 'Last week'
  if (days    < 28)  return `${weeks} weeks ago`
  if (days    < 60)  return 'Last month'
  if (years   < 1)   return `${months} ${months === 1 ? 'month' : 'months'} ago`

  return new Date(timestamp).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
