import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;
  const params = url.searchParams;

  // The old C-WAGS implementation remains in source temporarily as conversion
  // reference, but it must never be reachable in the SDDA-only application.
  const retiredPage =
    pathname === '/admin/merge-duplicates' ||
    pathname === '/entries' || pathname.startsWith('/entries/') ||
    pathname === '/ringside' || pathname.startsWith('/ringside/') ||
    pathname === '/dashboard/judges' || pathname.startsWith('/dashboard/judges/') ||
    pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/') ||
    /^\/dashboard\/trials\/create\/(days|levels|rounds|summary)(?:\/|$)/.test(pathname) ||
    /^\/dashboard\/trials\/[^/]+\/(close-to-titles|collaborators|journal|live-event|ringside|summary|time-calculator|trial-application)(?:\/|$)/.test(pathname);
  if (retiredPage) return NextResponse.redirect(new URL('/dashboard', request.url));

  const retiredApi = /^\/api\/(admin|invitations|public|registry|ringside|trials)(?:\/|$)/.test(pathname);
  if (retiredApi) {
    return NextResponse.json(
      { error: 'This legacy C-WAGS endpoint is retired in SDDA TrialDesk.' },
      { status: 410 }
    );
  }

  // -------------------------------------------------------
  // 🔥 1. Allow Supabase recovery links IMMEDIATELY
  // -------------------------------------------------------
  if (params.get('type') === 'recovery') {
    return NextResponse.next(); // VERY IMPORTANT
  }

  // Allow any URL that includes Supabase tokens
  if (params.has('token_hash') || params.has('access_token')) {
    return NextResponse.next();
  }

  // Allow the reset-password page to load
  if (pathname.startsWith('/login/reset-password')) {
    return NextResponse.next();
  }

  // -------------------------------------------------------
  // Continue normally for all other requests
  // -------------------------------------------------------
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set({ name, value, ...options })
          );
        },
      },
    }
  );

  // Refresh and validate the cookie-backed session on every matched request.
  // Merely constructing the server client does not refresh expired tokens,
  // which can make authenticated RLS queries intermittently appear anonymous.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
