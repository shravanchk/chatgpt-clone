export type RecencyGroup = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Previous 30 days' | 'Older'

const ORDER: RecencyGroup[] = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older']
const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function recencyGroup(isoDate: string, now: Date = new Date()): RecencyGroup {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(isoDate))) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 7) return 'Previous 7 days'
  if (days <= 30) return 'Previous 30 days'
  return 'Older'
}

/** Group items (already newest-first) into sidebar sections, preserving order. */
export function groupByRecency<T>(
  items: T[],
  dateOf: (item: T) => string,
  now: Date = new Date(),
): { group: RecencyGroup; items: T[] }[] {
  const groups = new Map<RecencyGroup, T[]>()
  for (const item of items) {
    const group = recencyGroup(dateOf(item), now)
    groups.set(group, [...(groups.get(group) ?? []), item])
  }
  return ORDER.filter((g) => groups.has(g)).map((group) => ({ group, items: groups.get(group) ?? [] }))
}
