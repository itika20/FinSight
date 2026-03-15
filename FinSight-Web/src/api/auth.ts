import api from './axios'
import type { User } from '../models'
import type { LoginPayload, LoginResponse } from '../models/login'
import type { SignupPayload } from '../models/signup'

// Call POST /auth/login — returns the JWT token
export const loginApi = async (payload: LoginPayload): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/auth/login', payload)
  return response.data
}

// Call POST /auth/signup — returns success message
export const signupApi = async (payload: SignupPayload): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>('/auth/signup', payload)
  return response.data
}

// Call GET /auth/me — returns the logged in user's info
// This is called on app load to validate a stored token
export const getMeApi = async (): Promise<User> => {
  const response = await api.get<User>('/auth/me')
  return response.data
}