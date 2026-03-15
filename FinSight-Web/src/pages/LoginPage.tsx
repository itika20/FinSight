import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loginApi } from '../api/auth'
import Input from '../shared/Input'
import Button from '../shared/Button'

// Regex for email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

  const handleSubmit = async () => {
    // Clear any previous form-level error
    setFormError('')

    // Run all validations — collect results
    // Both run regardless (don't short-circuit) so all errors show at once
    const isEmailValid = validateEmail(email)
    const isPasswordValid = validatePassword(password)

    // If any field is invalid, don't call API
    if (!isEmailValid || !isPasswordValid) return

    // Start loading — disables button, prevents double submit
    setIsLoading(true)

    try {
      // Call POST /auth/login
      const response = await loginApi({ email, password })

      // Hand token to AuthContext — it will fetch user info and set state
      await login(response.access_token)

      // Auth state is now set — navigate to dashboard
      navigate('/dashboard')

    } catch (error: any) {
      // Backend returned an error — show at form level
      const status = error?.response?.status

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