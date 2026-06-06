/**
 * TopCategoriesChart — "What drains me most?"
 * Horizontal bar chart ranked by total debit spend.
 * Clicking a bar fires onCategoryClick with the category name.
 */

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import type { CategoryTotal } from '../../utils/analyticsData'
import { fmtRupee } from '../../utils/analyticsData'

interface Props {
  data: CategoryTotal[]
  onCategoryClick?: (category: string) => void
}

const makeTooltip = (onCategoryClick?: Props['onCategoryClick']) =>
  function BarTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const d: CategoryTotal = payload[0].payload
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-sm">
        <p className="font-medium text-gray-800 mb-1">{label}</p>
        <p className="text-gray-600">{fmtRupee(d.amount)}</p>
        <p className="text-gray-400 text-xs">{d.percentage.toFixed(1)}% of total spend</p>
        {onCategoryClick && (
          <p className="text-gray-400 text-xs mt-1">Click to see transactions →</p>
        )}
      </div>
    )
  }

const TopCategoriesChart = ({ data, onCategoryClick }: Props) => {
  const top = data.slice(0, 8)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const TooltipContent = makeTooltip(onCategoryClick)

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
        <Tooltip content={<TooltipContent />} cursor={{ fill: '#f3f4f6' }} />
        <Bar
          dataKey="amount"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          onClick={(entry: any) => onCategoryClick?.(entry.category)}
          onMouseEnter={(_: any, index: number) => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
          style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
        >
          {top.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.color}
              opacity={activeIndex !== null && activeIndex !== i ? 0.55 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default TopCategoriesChart
