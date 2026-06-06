/**
 * SavingsVsSpendingChart — "Saving vs spending"
 * Dual-area chart comparing monthly credits (income/savings) vs debits (spending).
 */

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
      <p className="font-medium text-gray-700 mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600">{p.name}: {fmtRupee(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

const SavingsVsSpendingChart = ({ data }: Props) => (
  <ResponsiveContainer width="100%" height={280}>
    <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
      <defs>
        <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor="#f87171" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#f87171" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id="gradSave" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor="#34d399" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
        </linearGradient>
      </defs>
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
      <Legend
        iconType="circle"
        iconSize={8}
        wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
      />
      <Area
        type="monotone"
        dataKey="debit"
        name="Spending"
        stroke="#f87171"
        strokeWidth={2}
        fill="url(#gradSpend)"
      />
      <Area
        type="monotone"
        dataKey="credit"
        name="Income / Credits"
        stroke="#34d399"
        strokeWidth={2}
        fill="url(#gradSave)"
      />
    </AreaChart>
  </ResponsiveContainer>
)

export default SavingsVsSpendingChart
