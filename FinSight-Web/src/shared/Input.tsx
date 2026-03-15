interface InputProps {
  label: string
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string        // if this exists, show it below the input in red
  placeholder?: string
  disabled?: boolean
}

const Input = ({
  label,
  type = 'text',
  value,
  onChange,
  error,
  placeholder,
  disabled
}: InputProps) => {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          px-4 py-2 rounded-lg border text-sm outline-none transition-all
          ${error
            ? 'border-red-400 focus:ring-2 focus:ring-red-200'
            : 'border-gray-300 focus:ring-2 focus:ring-blue-200 focus:border-blue-400'
          }
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
        `}
      />
      {/* Only renders if error prop is passed */}
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  )
}

export default Input