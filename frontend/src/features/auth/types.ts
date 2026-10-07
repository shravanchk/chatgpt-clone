export interface User {
  id: string
  email: string
  display_name: string
  created_at: string
}

/** Body of register / login / refresh. The refresh token itself is an httpOnly cookie. */
export interface AuthResponse {
  user: User
  access_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest extends LoginRequest {
  display_name: string
}
