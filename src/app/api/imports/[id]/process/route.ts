import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/api";
import { processImportJob } from "@/lib/imports/process-import";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("import.upload");
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid import id." }, { status: 400 });
  const outcome = await processImportJob(id, auth.session.user.id);
  if (!outcome.ok) return NextResponse.json({ error: outcome.message }, { status: outcome.httpStatus });
  return NextResponse.json(outcome);
}
