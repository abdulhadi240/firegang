import { NextRequest, NextResponse } from 'next/server'
import { checkCredentials, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!checkCredentials(email, password)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  const response = NextResponse.json({ success: true })
  const { name, value, ...options } = sessionCookieOptions()
  response.cookies.set(name, value, options)
  return response
}
