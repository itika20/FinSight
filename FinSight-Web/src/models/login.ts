// Shape of what login endpoint expects
export interface LoginPayload {
  email: string
  password: string
}

// Shape of what login endpoint returns
export interface LoginResponse {
  access_token: string
  token_type: string
}