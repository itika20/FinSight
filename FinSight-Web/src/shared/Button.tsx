/**
 * Button Component - Reusable Button with Multiple Variants
 *
 * Features:
 * - Primary variant (blue) for call-to-action
 * - Secondary variant (gray) for less important actions
 * - Loading state with spinner text feedback
 * - Disabled state with visual feedback
 * - Full width option for forms
 * - Type variants: button, submit
 *
 * Usage:
 * ```
 * // Login form submit button
 * <Button
 *   type="submit"
 *   label="Sign In"
 *   isLoading={isLoading}
 *   onClick={handleSubmit}
 *   fullWidth
 * />
 *
 * // Secondary action
 * <Button
 *   variant="secondary"
 *   label="Cancel"
 *   onClick={onCancel}
 * />
 *
 * // Disabled button
 * <Button
 *   label="Disabled"
 *   disabled={true}
 * />
 * ```
 */

interface ButtonProps {
  /** Button text label */
  label: string

  /** Callback when button clicked (not fired if disabled or loading) */
  onClick?: () => void

  /** HTML button type (button: regular click, submit: triggered by form submission) */
  type?: 'button' | 'submit'

  /** True to disable interaction and show disabled styling */
  disabled?: boolean

  /** True to show loading state: "Please wait..." text, disabled interaction */
  isLoading?: boolean

  /** Visual style variant (primary: blue, secondary: gray) */
  variant?: 'primary' | 'secondary'

  /** True to make button full width (100% of container) */
  fullWidth?: boolean
}

/**
 * Component - Styled button with variants and loading state.
 *
 * @param label - Button text displayed to user
 * @param onClick - Callback function when clicked
 * @param type - Button type ('button' or 'submit' for form)
 * @param disabled - Disable user interaction
 * @param isLoading - Show loading state (changes text to "Please wait...")
 * @param variant - Visual style ('primary' = blue, 'secondary' = gray)
 * @param fullWidth - Expand to 100% container width
 *
 * @returns Styled button element that responds to click and disabled states
 *
 * @example
 * // Primary action button
 * <Button
 *   label="Upload"
 *   onClick={handleUpload}
 *   isLoading={uploading}
 *   fullWidth
 * />
 *
 * @example
 * // Form submit button
 * <form onSubmit={handleSubmit}>
 *   <input type="email" placeholder="Email" />
 *   <Button
 *     type="submit"
 *     label="Login"
 *     isLoading={isLoading}
 *     fullWidth
 *   />
 * </form>
 */
const Button = ({
  label,
  onClick,
  type = 'button',
  disabled,
  isLoading,
  variant = 'primary',
  fullWidth
}: ButtonProps) => {
  // ============================================================================
  // TAILWIND CLASSES
  // ============================================================================

  // Base styles — applied to all variants
  const base = 'px-4 py-2 rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2'

  // Variant-specific styles
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 focus:ring-blue-500',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50 focus:ring-gray-400'
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        ${base}
        ${variants[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${(disabled || isLoading) ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}
      `}
      aria-busy={isLoading}
      aria-disabled={disabled}
    >
      {/* Show loading feedback to user while request is in flight */}
      {isLoading ? '⏳ Please wait...' : label}
    </button>
  )
}

export default Button