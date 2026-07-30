import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Bypass landing page and auth for development:
  // Redirect root "/" directly to "/workspaces"
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/workspaces', request.url))
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
