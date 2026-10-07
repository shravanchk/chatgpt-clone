import BarChartOutlined from '@mui/icons-material/BarChartOutlined'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { useMemo, useState, type ReactElement } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useIsDarkMode } from '../lib/hooks'
import { parseChartSpec, type ChartSpec } from '../lib/chartSpec'
import { CodeBlock } from './CodeBlock'

// Categorical palette, fixed order, validated for colour-vision deficiency in both modes
// (dataviz reference palette). Dark steps are selected for the dark surface, not inverted.
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

interface ChartBlockProps {
  source: string
  /** While the reply is streaming the JSON is usually incomplete: show a placeholder. */
  streaming?: boolean
}

export function ChartBlock({ source, streaming = false }: ChartBlockProps) {
  const spec = useMemo(() => parseChartSpec(source), [source])
  const [showTable, setShowTable] = useState(false)

  if (!spec) {
    return streaming ? (
      <Skeleton variant="rounded" height={300} sx={{ my: 2 }} aria-label="Drawing chart" />
    ) : (
      <CodeBlock code={source} language="json" />
    )
  }

  return (
    <Box
      component="figure"
      sx={{ my: 2, mx: 0, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography component="figcaption" variant="subtitle2">
          {spec.title ?? 'Chart'}
        </Typography>
        <Button
          size="small"
          color="inherit"
          startIcon={showTable ? <BarChartOutlined /> : <TableChartOutlined />}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? 'View chart' : 'View data'}
        </Button>
      </Stack>
      {showTable ? <ChartTable spec={spec} /> : <ChartGraphic spec={spec} />}
    </Box>
  )
}

function ChartGraphic({ spec }: { spec: ChartSpec }) {
  const theme = useTheme()
  const colors = useIsDarkMode() ? SERIES_DARK : SERIES_LIGHT
  const vars = theme.vars?.palette ?? theme.palette
  const muted = vars.text.secondary
  const axis = { stroke: vars.divider, tick: { fill: muted, fontSize: 12 } }
  const tooltipStyle = {
    backgroundColor: vars.background.paper,
    border: `1px solid ${vars.divider}`,
    borderRadius: 8,
    color: vars.text.primary,
  }
  const showLegend = spec.series.length > 1 || spec.type === 'pie'
  // Legend text uses text colour (the swatch carries identity) and keeps series order.
  const legend = (
    <Legend
      itemSorter={null}
      formatter={(value) => <span style={{ color: muted }}>{value}</span>}
    />
  )
  const seriesName = (s: ChartSpec['series'][number]) => s.name ?? s.key

  let chart: ReactElement
  if (spec.type === 'pie') {
    const valueKey = spec.series[0]!.key
    chart = (
      <PieChart>
        <Pie data={spec.data} dataKey={valueKey} nameKey={spec.xKey} innerRadius="45%" stroke={vars.background.paper} strokeWidth={2}>
          {spec.data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        {legend}
      </PieChart>
    )
  } else {
    const common = (
      <>
        <CartesianGrid stroke={vars.divider} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={spec.xKey} {...axis} tickLine={false} />
        <YAxis {...axis} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: vars.action.hover }} />
        {showLegend && legend}
      </>
    )
    if (spec.type === 'bar') {
      chart = (
        <BarChart data={spec.data} barGap={2}>
          {common}
          {spec.series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={seriesName(s)} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      )
    } else if (spec.type === 'line') {
      chart = (
        <LineChart data={spec.data}>
          {common}
          {spec.series.map((s, i) => (
            <Line key={s.key} dataKey={s.key} name={seriesName(s)} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4 }} type="monotone" />
          ))}
        </LineChart>
      )
    } else {
      chart = (
        <AreaChart data={spec.data}>
          {common}
          {spec.series.map((s, i) => (
            <Area key={s.key} dataKey={s.key} name={seriesName(s)} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2} strokeWidth={2} type="monotone" />
          ))}
        </AreaChart>
      )
    }
  }

  return (
    <Box sx={{ width: '100%', height: 300 }} role="img" aria-label={spec.title ?? 'Chart'}>
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </Box>
  )
}

/** Accessible alternative to the graphic: the same data as a table. */
function ChartTable({ spec }: { spec: ChartSpec }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label={`${spec.title ?? 'Chart'} data`}>
        <TableHead>
          <TableRow>
            <TableCell>{spec.xKey}</TableCell>
            {spec.series.map((s) => (
              <TableCell key={s.key} align="right">
                {s.name ?? s.key}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {spec.data.map((row, i) => (
            <TableRow key={i}>
              <TableCell>{row[spec.xKey]}</TableCell>
              {spec.series.map((s) => (
                <TableCell key={s.key} align="right">
                  {row[s.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
