import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  await requirePermission("import.upload");
  const supabase = await createClient();
  const { data } = await supabase.from("securities").select("company_id,ticker,companies(legal_name)").eq("is_primary", true).order("ticker");
  const companies = (data ?? []).map((s: { company_id: string; ticker: string; companies: { legal_name: string } | { legal_name: string }[] | null }) => {
    const c = Array.isArray(s.companies) ? s.companies[0] : s.companies;
    return { id: s.company_id, label: `${s.ticker} · ${c?.legal_name ?? ""}` };
  });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Upload workbooks</h1>
      <p className="max-w-xl text-sm text-muted">Each file becomes its own import with a draft snapshot. Nothing is published from this screen, and the public site is not affected.</p>
      <UploadForm companies={companies} />
    </div>
  );
}
