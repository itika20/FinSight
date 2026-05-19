/**
 * SpendingDonutChart — "Where does my money go?"
 * Donut chart of spending by category with custom tooltip.
 */

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { CategoryTotal } from '../../utils/analyticsData'
import { fmtRupee } from '../../utils/analyticsData'

interface Props {
  data: CategoryTotal[]
}

const CustomTooltip = ({ active, payload }: any) => {
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

const SpendingDonutChart = ({ data }: Props) => (
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
      >
        {data.map((entry, i) => (
          <Cell key={i} fill={entry.color} stroke="none" />
        ))}
      </Pie>
      <Tooltip content={<CustomTooltip />} />
      <Legend content={renderLegend} />
    </PieChart>
  </ResponsiveContainer>
)

export default SpendingDonutChart
