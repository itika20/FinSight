/**
 * MonthlyTrendChart — "Am I spending more than usual?"
 * Line chart of total monthly debit spend over time.
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot,
} from 'recharts'
import type { MonthlyTotal } from '../../utils/analyticsData'
import { fmtRupee } from '../../utils/analyticsData'

interface Props {
  data: MonthlyTotal[]
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

const MonthlyTrendChart = ({ data }: Props) => (
  <ResponsiveContainer width="100%" height={280}>
    <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11, fill: '#9ca3af' }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        tickFormatter={v => fmtRupee(v)}
        tick={{ fontSize: 10, fill: '#9ca3af' }}
        axisLine={false}
        tickLine={false}
        width={70}
      />
      <Tooltip content={<CustomTooltip />} />
      <Line
        type="monotone"
        dataKey="debit"
        name="Spend"
        stroke="#3b82f6"
        strokeWidth={2.5}
        dot={<Dot r={4} fill="#3b82f6" stroke="#fff" strokeWidth={2} />}
        activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
      />
    </LineChart>
  </ResponsiveContainer>
)

export default MonthlyTrendChart
