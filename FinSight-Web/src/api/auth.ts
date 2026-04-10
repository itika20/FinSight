/**
 * Authentication API Functions
 * Handles communication with backend auth endpoints.
 * Uses axios instance with automatic token injection.
 */

import api from './axios'
import type { User } from '../models'
import type { LoginPayload, LoginResponse } from '../models/login'
import type { SignupPayload } from '../models/signup'
import { AUTH_ENDPOINTS } from '../constants/config'

/**
 * Login API Call - Authenticates user and retrieves JWT token.
 * 
 * @param payload - LoginPayload with email and password
 * @returns Promise<LoginResponse> - Contains access_token
 * 
 * @throws HTTPException - 401 if credentials invalid
 * @throws Network error - If API unreachable
 * 
 * @example
 * const response = await loginApi({ email: 'user@example.com', password: 'pass123' })
 * const token = response.access_token
 */
export const loginApi = async (payload: LoginPayload): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>(AUTH_ENDPOINTS.LOGIN, payload)
  return response.data
}

/**
 * Signup API Call - Creates a new user account.
 * 
 * @param payload - SignupPayload with email and password
 * @returns Promise<{message: string}> - Success message
 * 
 * @throws HTTPException - 409 if email already registered
 * @throws Network error - If API unreachable
 * 
 * @example
 * const response = await signupApi({ email: 'new@example.com', password: 'secure123' })
 * // Account created successfully
 */
export const signupApi = async (payload: SignupPayload): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>(AUTH_ENDPOINTS.SIGNUP, payload)
  return response.data
}

/**
 * Get Current User API Call - Retrieves authenticated user's profile.
 * Requires valid JWT token in Authorization header.
 * 
 * Usage:
 * - Called on app load to validate token and restore session
 * - Called after successful login to get user info
 * - Called to check if token is still valid (401 means expired)
 * 
 * @returns Promise<User> - User object with id, email, created_at
 * 
 * @throws HTTPException - 401 if token missing or expired
 * @throws Network error - If API unreachable
 * 
 * @example
 * const user = await getMeApi()
 * // Returns: { id: "...", email: "user@example.com", created_at: "2026-04-01T..." }
 */
export const getMeApi = async (): Promise<User> => {
  const response = await api.get<User>(AUTH_ENDPOINTS.ME)
  return response.data
}