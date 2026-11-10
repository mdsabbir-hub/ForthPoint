import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const read = (name: string) => process.env[name];
  return NextResponse.json({
    namesPresentAtRuntime: Object.keys(process.env).filter((k) => k.toUpperCase().includes("SUPABASE")).sort(),
    runtimeUrlSet: Boolean(read("NEXT_PUBLIC_SUPABASE_URL")),
    runtimeAnonSet: Boolean(read("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
    builtInUrlSet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    builtInAnonSet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleSet: Boolean(read("SUPABASE_SERVICE_ROLE_KEY")),
    vercelEnvironment: process.env.VERCEL_ENV ?? null,
  });
}
