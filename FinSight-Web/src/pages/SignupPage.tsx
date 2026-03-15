import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signupApi } from '../api/auth'
import Input from '../shared/Input'
import Button from '../shared/Button'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Password must be min 7 chars, at least one uppercase, at least one number
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{7,}$/

const SignupPage = () => {
    console.log('API URL:', import.meta.env.VITE_API_BASE_URL)
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [confirmPassword, setConfirmPassword] = useState<string>('')

  const [emailError, setEmailError] = useState<string>('')
  const [passwordError, setPasswordError] = useState<string>('')
  const [confirmPasswordError, setConfirmPasswordError] = useState<string>('')
  const [formError, setFormError] = useState<string>('')

  // Success state — show confirmation message before redirecting
  const [isSuccess, setIsSuccess] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const navigate = useNavigate()

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
    if (!PASSWORD_REGEX.test(value)) {
      setPasswordError('Min 7 characters, one uppercase letter and one number required')
      return false
    }
    setPasswordError('')
    return true
  }

  const validateConfirmPassword = (value: string): boolean => {
    if (!value.trim()) {
      setConfirmPasswordError('Please confirm your password')
      return false
    }
    if (value !== password) {
      setConfirmPasswordError('Passwords do not match')
      return false
    }
    setConfirmPasswordError('')
    return true
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setEmail(value)
    if (emailError) validateEmail(value)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setPassword(value)
    if (passwordError) validatePassword(value)
    // If confirm password already has a value, re-validate it against new password
    if (confirmPassword) validateConfirmPassword(confirmPassword)
  }

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setConfirmPassword(value)
    if (confirmPasswordError) validateConfirmPassword(value)
  }

  const handleSubmit = async () => {
    setFormError('')

    // Validate all three fields — all run so all errors show at once
    const isEmailValid = validateEmail(email)
    const isPasswordValid = validatePassword(password)
    const isConfirmValid = validateConfirmPassword(confirmPassword)

    if (!isEmailValid || !isPasswordValid || !isConfirmValid) return

    setIsLoading(true)

    try {
      // Call POST /auth/signup — only send email and password
      // Backend generates the UUID — frontend never creates IDs
      await signupApi({ email, password })

      // Show success message briefly then redirect to login
      setIsSuccess(true)
      setTimeout(() => navigate('/login'), 2000)

    } catch (error: any) {
      const status = error?.response?.status

      if (status === 409) {
        // Email already registered
        setFormError('An account with this email already exists. Please log in.')
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const isButtonDisabled =
    !email.trim() || !password.trim() || !confirmPassword.trim() || isLoading

  // Show success screen after signup
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900">Account created!</h2>
          <p className="text-sm text-gray-500 mt-2">Redirecting you to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
          <p className="text-sm text-gray-500 mt-1">Start analysing your finances today</p>
        </div>

        {/* Form-level error */}
        {formError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{formError}</p>
          </div>
        )}

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
            placeholder="Min 7 chars, one uppercase, one number"
            disabled={isLoading}
          />
          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={handleConfirmPasswordChange}
            error={confirmPasswordError}
            placeholder="Re-enter your password"
            disabled={isLoading}
          />
        </div>

        <div className="mt-6">
          <Button
            label="Create Account"
            onClick={handleSubmit}
            disabled={isButtonDisabled}
            isLoading={isLoading}
            fullWidth
          />
        </div>

        <p className="text-sm text-center text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  )
}

export default SignupPage