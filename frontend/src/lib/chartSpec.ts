/** JSON spec inside a ```chart fence (the format is documented in the backend prompt). */
export interface ChartSpec {
  type: 'bar' | 'line' | 'area' | 'pie'
  title?: string
  xKey: string
  series: { key: string; name?: string }[]
  data: Record<string, string | number>[]
}

const CHART_TYPES = new Set(['bar', 'line', 'area', 'pie'])

export function parseChartSpec(source: string): ChartSpec | null {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const spec = value as Partial<ChartSpec>
  const valid =
    typeof spec.type === 'string' &&
    CHART_TYPES.has(spec.type) &&
    typeof spec.xKey === 'string' &&
    Array.isArray(spec.series) &&
    spec.series.length > 0 &&
    spec.series.every((s) => typeof s?.key === 'string') &&
    Array.isArray(spec.data) &&
    spec.data.every((row) => typeof row === 'object' && row !== null)
  return valid ? (spec as ChartSpec) : null
}
