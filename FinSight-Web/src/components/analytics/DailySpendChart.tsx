/**
 * DailySpendChart — "Day-by-day patterns"
 * Vertical bar chart of daily debit spend within the selected range.
 * When range > 60 days the x-axis labels are thinned automatically.
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { DailyTotal } from '../../utils/analyticsData'
import { fmtRupee } from '../../utils/analyticsData'

interface Props {
  data: DailyTotal[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-gray-800">{fmtRupee(payload[0].value)}</p>
    </div>
  )
}

// Highlight the highest-spend day
const DailySpendChart = ({ data }: Props) => {
  const maxAmount = Math.max(...data.map(d => d.amount), 0)
  // Show ~12 x-axis labels regardless of how many bars
  const tickInterval = Math.max(0, Math.floor(data.length / 12) - 1)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
        />
        <YAxis
          tickFormatter={v => fmtRupee(v)}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
        <Bar dataKey="amount" radius={[3, 3, 0, 0]} maxBarSize={28}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.amount === maxAmount ? '#3b82f6' : '#bfdbfe'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default DailySpendChart
