import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isAdmin = request.nextUrl.pathname.startsWith("/admin");

  if (!url || !key) {
    console.error("Supabase env vars missing in middleware");
    if (isAdmin) return new NextResponse("Server is not configured: Supabase variables are missing.", { status: 503 });
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieToSet[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user && isAdmin) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(login);
    }
  } catch (err) {
    console.error("Middleware auth error", err);
    if (isAdmin) return new NextResponse("Authentication service unavailable.", { status: 503 });
  }
  return response;
}
