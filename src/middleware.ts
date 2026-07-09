import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Simple auth check using a cookie for demonstration
  const isAuthenticated = request.cookies.has('demo_auth')
  const isLoginPage = request.nextUrl.pathname === '/'

  if (!isAuthenticated && !isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL('/workspaces', request.url))
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
