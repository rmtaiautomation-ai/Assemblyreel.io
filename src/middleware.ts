import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Simple auth check using a cookie for demonstration
  const isAuthenticated = request.cookies.has('demo_auth')
  const isPublicPage = request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/pricing'

  if (!isAuthenticated && !isPublicPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // If authenticated, don't allow them to see the landing page, redirect to dashboard.
  // We can let them see the pricing page though, or redirect them. Let's let them see pricing.
  if (isAuthenticated && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/workspaces', request.url))
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
