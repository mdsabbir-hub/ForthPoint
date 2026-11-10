import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions/roles";

/** For route handlers. Returns the session, or a ready-made 401/403 response. */
export async function requireApiPermission(permission: Permission) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) } as const;
  if (!can(session.roles, permission)) return { error: NextResponse.json({ error: "Not permitted." }, { status: 403 }) } as const;
  return { session } as const;
}
