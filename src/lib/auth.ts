import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

export const ADMIN_USER_ID = 'admin'
export const ADMIN_EMAIL = 'admin@firegang.com'

const COOKIE_NAME = 'auth_session'
const ADMIN_PASSWORD = 'Qwertyuiop1!'

function getSecret() {
  return process.env.AUTH_SECRET!
}

export function checkCredentials(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD
}

export function isAuthenticatedFromRequest(request: NextRequest): boolean {
  return request.cookies.get(COOKIE_NAME)?.value === getSecret()
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value === getSecret()
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: getSecret(),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }
}
