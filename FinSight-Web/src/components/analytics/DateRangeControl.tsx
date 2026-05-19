/**
 * DateRangeControl — preset tabs + optional custom date inputs.
 * Sits at the top of the Analytics page and controls all charts.
 */

import type { RangePreset } from '../../utils/analyticsData'

interface DateRangeControlProps {
  preset: RangePreset
  customFrom: string
  customTo: string
  onPresetChange: (p: RangePreset) => void
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '3m',  label: 'Last 3 months' },
  { value: '6m',  label: 'Last 6 months' },
  { value: 'ytd', label: 'This year' },
  { value: 'custom', label: 'Custom' },
]

const DateRangeControl = ({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: DateRangeControlProps) => (
  <div className="flex flex-wrap items-center gap-3">
    {/* Preset pills */}
    <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl p-1">
      {PRESETS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onPresetChange(value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            preset === value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>

    {/* Custom date inputs — shown only when preset === 'custom' */}
    {preset === 'custom' && (
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={customFrom}
          onChange={e => onCustomFromChange(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-400">→</span>
        <input
          type="date"
          value={customTo}
          onChange={e => onCustomToChange(e.target.value)}
          min={customFrom}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    )}
  </div>
)

export default DateRangeControl
