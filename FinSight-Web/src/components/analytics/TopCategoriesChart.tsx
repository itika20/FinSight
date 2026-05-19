/**
 * TopCategoriesChart — "What drains me most?"
 * Horizontal bar chart ranked by total debit spend.
 */

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import type { CategoryTotal } from '../../utils/analyticsData'
import { fmtRupee } from '../../utils/analyticsData'

interface Props {
  data: CategoryTotal[]   // already sorted desc, takes top 8
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d: CategoryTotal = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-sm">
      <p className="font-medium text-gray-800 mb-1">{label}</p>
      <p className="text-gray-600">{fmtRupee(d.amount)}</p>
      <p className="text-gray-400 text-xs">{d.percentage.toFixed(1)}% of total spend</p>
    </div>
  )
}

const TopCategoriesChart = ({ data }: Props) => {
  const top = data.slice(0, 8)
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={top}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <XAxis
          type="number"
          tickFormatter={v => fmtRupee(v)}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={90}
          tick={{ fontSize: 11, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {top.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default TopCategoriesChart
