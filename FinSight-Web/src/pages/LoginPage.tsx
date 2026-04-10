/**
 * LoginPage Component - User Authentication
 *
 * Displays login form with email/password fields.
 * Validates inputs client-side before calling backend.
 * Handles both successful login and common error cases.
 *
 * Flow:
 * 1. User enters email and password
 * 2. Form validates fields on submit
 * 3. POST /auth/login to backend
 * 4. Backend returns JWT token
 * 5. AuthContext saves token and fetches user info
 * 6. Automatically redirects to /dashboard
 * 7. If error, displays form-level message
 *
 * Validation:
 * - Email: required, must be valid email format
 * - Password: required, minimum 1 character
 * - Both: live validation shows error only if user has typed
 *
 * Error Handling:
 * - 401: Invalid credentials (same message for both failures)
 * - 404: No account found with email
 * - Other: Generic server error
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loginApi } from '../api/auth'
import { VALIDATION_RULES } from '../constants/config'
import Input from '../shared/Input'
import Button from '../shared/Button'

// Email validation regex from constants
const EMAIL_REGEX = VALIDATION_RULES.emailRegex

const LoginPage = () => {
  // Form field state
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')

  // Field-level errors — one per input
  const [emailError, setEmailError] = useState<string>('')
  const [passwordError, setPasswordError] = useState<string>('')

  // Form-level error — comes from backend
  const [formError, setFormError] = useState<string>('')

  // Loading state — true while API call is in progress
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  // Validates a single field and sets its error
  // Returns true if valid, false if not
  const validateEmail = (value: string): boolean => {
    if (!value.trim()) {
      setEmailError('Email is required')
      return false
    }
    if (!EMAIL_REGEX.test(value)) {
      setEmailError('Please enter a valid email address')
      return false
    }
    setEmailError('')
    return true
  }

  const validatePassword = (value: string): boolean => {
    if (!value.trim()) {
      setPasswordError('Password is required')
      return false
    }
    setPasswordError('')
    return true
  }

  // Runs on every keystroke in email field
  // Only shows error after user has typed something (not on first load)
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setEmail(value)
    if (emailError) validateEmail(value) // re-validate live only if error already showing
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setPassword(value)
    if (passwordError) validatePassword(value)
  }

  /**
   * Handler - Submit login form.
   *
   * Process:
   * 1. Validate both email and password (show all errors at once)
   * 2. Call POST /auth/login with credentials
   * 3. Backend validates and returns JWT token
   * 4. Pass token to AuthContext.login()
   * 5. AuthContext saves token, fetches user info
   * 6. Redirect to /dashboard
   * 7. On error, extract HTTP status and show appropriate message
   */
  const handleSubmit = async () => {
    console.log('[LoginPage] Form submitted')
    // Clear any previous form-level error
    setFormError('')

    // Run all validations — collect results
    // Both run regardless (don't short-circuit) so all errors show at once
    const isEmailValid = validateEmail(email)
    const isPasswordValid = validatePassword(password)

    // If any field is invalid, don't call API
    if (!isEmailValid || !isPasswordValid) {
      console.log('[LoginPage] Validation failed')
      return
    }

    console.log('[LoginPage] Validation passed, calling login API')
    // Start loading — disables button, prevents double submit
    setIsLoading(true)

    try {
      // Call POST /auth/login
      console.log('[LoginPage] POST /auth/login')
      const response = await loginApi({ email, password })

      // Hand token to AuthContext — it will fetch user info and set state
      console.log('[LoginPage] Token received, updating AuthContext')
      await login(response.access_token)

      console.log('[LoginPage] Login complete, navigating to dashboard')
      // Auth state is now set — navigate to dashboard
      navigate('/dashboard')

    } catch (error: any) {
      // Backend returned an error — show at form level
      const status = error?.response?.status
      console.warn('[LoginPage] Login failed:', status, error?.response?.data)

      if (status === 401) {
        // Wrong credentials
        setFormError('Incorrect email or password')
      } else if (status === 404) {
        // User not found
        setFormError('No account found with this email. Please sign up.')
      } else {
        // Something else went wrong
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      // Always stop loading whether success or failure
      setIsLoading(false)
    }
  }

  // Button is disabled if either field is empty OR loading is in progress
  const isButtonDisabled = !email.trim() || !password.trim() || isLoading

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your FinSight account</p>
        </div>

        {/* Form-level error — only shows when formError has a value */}
        {formError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{formError}</p>
          </div>
        )}

        {/* Form fields */}
        <div className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={handleEmailChange}
            error={emailError}
            placeholder="you@example.com"
            disabled={isLoading}
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={handlePasswordChange}
            error={passwordError}
            placeholder="Enter your password"
            disabled={isLoading}
          />
        </div>

        {/* Submit button */}
        <div className="mt-6">
          <Button
            label="Sign In"
            onClick={handleSubmit}
            disabled={isButtonDisabled}
            isLoading={isLoading}
            fullWidth
          />
        </div>

        {/* Signup link */}
        <p className="text-sm text-center text-gray-500 mt-4">
          Don't have an account?{' '}
          <Link to="/signup" className="text-blue-600 font-medium hover:underline">
            Sign up
          </Link>
        </p>

      </div>
    </div>
  )
}

export default LoginPage