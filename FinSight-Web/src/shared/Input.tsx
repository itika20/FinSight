/**
 * Input Component - Reusable Form Input Field
 *
 * Features:
 * - Label above input
 * - Type variants: text, email, password, number, etc.
 * - Error state with red border and error message display
 * - Placeholder text
 * - Disabled state
 * - Focus ring (blue for normal, red for error)
 * - Smooth transitions between states
 *
 * Error Display:
 * - When error prop is provided, input shows red border
 * - Error message displays below input in small red text
 * - Useful for form validation feedback
 *
 * Usage:
 * ```
 * function LoginForm() {
 *   const [email, setEmail] = useState('')
 *   const [emailError, setEmailError] = useState('')
 *
 *   const handleSubmit = () => {
 *     if (!email.includes('@')) {
 *       setEmailError('Invalid email address')
 *       return
 *     }
 *     submitLogin(email)
 *   }
 *
 *   return (
 *     <Input
 *       label="Email"
 *       type="email"
 *       value={email}
 *       onChange={(e) => {
 *         setEmail(e.target.value)
 *         if (emailError) setEmailError('')  // Clear error on change
 *       }}
 *       error={emailError}
 *       placeholder="user@example.com"
 *     />
 *   )
 * }
 * ```
 */

interface InputProps {
  /** Label text displayed above input */
  label: string

  /** HTML input type (text, email, password, number, etc.) */
  type?: string

  /** Current value — controlled component */
  value: string

  /** Callback on input change (receives React.ChangeEvent) */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void

  /** Error message to display below input (if empty, no error state) */
  error?: string

  /** Placeholder text shown when input is empty */
  placeholder?: string

  /** True to disable input and show disabled styling */
  disabled?: boolean
}

/**
 * Component - Controlled form input with label and error message.
 *
 * Props:
 * @param label - Label text
 * @param type - Input type (default: 'text')
 * @param value - Current input value (controlled component)
 * @param onChange - Change handler
 * @param error - Error message (if present, shows error state)
 * @param placeholder - Placeholder text
 * @param disabled - Disable interaction
 *
 * @example
 * <Input
 *   label="Email Address"
 *   type="email"
 *   value={email}
 *   onChange={(e) => setEmail(e.target.value)}
 *   error={formErrors.email}
 *   placeholder="you@example.com"
 * />
 *
 * @example
 * <Input
 *   label="Password"
 *   type="password"
 *   value={password}
 *   onChange={(e) => setPassword(e.target.value)}
 *   placeholder="At least 8 characters"
 * />
 */
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
    <div className="flex flex-col gap-2">
      {/* Label */}
      <label className="text-sm font-medium text-gray-700">
        {label}
      </label>

      {/* Input Field */}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          px-4 py-2 rounded-lg border text-sm outline-none transition-all
          focus:outline-none focus:ring-2
          ${error
            ? 'border-red-400 bg-red-50 focus:ring-red-200 focus:border-red-500'
            : 'border-gray-300 bg-white focus:ring-blue-200 focus:border-blue-400'
          }
          ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}
        `}
        aria-invalid={!!error}
        aria-describedby={error ? `${label}-error` : undefined}
      />

      {/* Error Message — only renders if error prop is provided */}
      {error && (
        <span
          id={`${label}-error`}
          className="text-xs text-red-600 font-medium"
          role="alert"
        >
          ⚠️ {error}
        </span>
      )}
    </div>
  )
}

export default Input