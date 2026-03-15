interface ButtonProps {
  label: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  isLoading?: boolean
  variant?: 'primary' | 'secondary'
  fullWidth?: boolean
}

const Button = ({
  label,
  onClick,
  type = 'button',
  disabled,
  isLoading,
  variant = 'primary',
  fullWidth
}: ButtonProps) => {
  const base = 'px-4 py-2 rounded-lg text-sm font-semibold transition-all focus:outline-none'

  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50'
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        ${base}
        ${variants[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${(disabled || isLoading) ? 'cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Show spinner text while loading, label otherwise */}
      {isLoading ? 'Please wait...' : label}
    </button>
  )
}

export default Button