/**
 * SpendingDonutChart — "Where does my money go?"
 * Donut chart of spending by category with custom tooltip.
 * Clicking a slice fires onCategoryClick with the category name.
 */

import { useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { CategoryTotal } from '../../utils/analyticsData'
import { fmtRupee } from '../../utils/analyticsData'

interface Props {
  data: CategoryTotal[]
  onCategoryClick?: (category: string) => void
}

// Tooltip factory — captures onCategoryClick in closure so the "click to see"
// hint only appears when the chart is in clickable mode.
const makeTooltip = (onCategoryClick?: Props['onCategoryClick']) =>
  function DonutTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d: CategoryTotal = payload[0].payload
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
          <span className="font-medium text-gray-800">{d.category}</span>
        </div>
        <p className="text-gray-600">{fmtRupee(d.amount)}</p>
        <p className="text-gray-400 text-xs">{d.percentage.toFixed(1)}% of total spend</p>
        {onCategoryClick && (
          <p className="text-gray-400 text-xs mt-1">Click to see transactions →</p>
        )}
      </div>
    )
  }

const renderLegend = (props: any) => {
  const { payload } = props
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3">
      {payload.map((entry: any, i: number) => (
        <li key={i} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-xs text-gray-600 truncate max-w-[100px]">{entry.value}</span>
        </li>
      ))}
    </ul>
  )
}

const SpendingDonutChart = ({ data, onCategoryClick }: Props) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const TooltipContent = makeTooltip(onCategoryClick)

  return (
    <ResponsiveContainer width="100%" height={380}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="42%"
          innerRadius={70}
          outerRadius={110}
          dataKey="amount"
          nameKey="category"
          paddingAngle={2}
          onMouseEnter={(_: any, index: number) => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
          onClick={(entry: any) => onCategoryClick?.(entry.category)}
          style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
        >
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.color}
              stroke={activeIndex === i ? '#fff' : 'none'}
              strokeWidth={activeIndex === i ? 2 : 0}
              opacity={activeIndex !== null && activeIndex !== i ? 0.55 : 1}
            />
          ))}
        </Pie>
        <Tooltip content={<TooltipContent />} />
        <Legend content={renderLegend} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export default SpendingDonutChart
