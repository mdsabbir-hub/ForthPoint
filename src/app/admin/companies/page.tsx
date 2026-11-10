import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { writeAudit } from "@/lib/auth/audit";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{1,11}$/),
  legalName: z.string().trim().min(2).max(200),
  sector: z.enum(["INDUSTRIAL", "BANK", "INSURANCE"]),
});

async function createCompany(formData: FormData) {
  "use server";
  const { user } = await requirePermission("import.upload");
  const parsed = schema.safeParse({ ticker: formData.get("ticker"), legalName: formData.get("legalName"), sector: formData.get("sector") });
  if (!parsed.success) redirect("/admin/companies?error=" + encodeURIComponent("Enter a ticker (letters and digits) and a company name."));
  const admin = createAdminClient();
  const { data: sector } = await admin.from("sectors").select("id").eq("code", parsed.data.sector).maybeSingle();
  const { data: company, error } = await admin.from("companies").insert({ legal_name: parsed.data.legalName, short_name: parsed.data.ticker, sector_id: sector?.id ?? null }).select("id").single();
  if (error || !company) redirect("/admin/companies?error=" + encodeURIComponent("The company could not be created."));
  const { error: secErr } = await admin.from("securities").insert({ company_id: company.id, ticker: parsed.data.ticker, exchange: "DSE" });
  if (secErr) {
    await admin.from("companies").delete().eq("id", company.id);
    redirect("/admin/companies?error=" + encodeURIComponent(`Ticker ${parsed.data.ticker} already exists.`));
  }
  await writeAudit(admin, { actorId: user.id, action: "company.created", entityType: "company", entityId: company.id, details: { ticker: parsed.data.ticker } });
  revalidatePath("/admin/companies");
  redirect("/admin/companies?created=" + encodeURIComponent(parsed.data.ticker));
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  await requirePermission("import.review");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("securities").select("ticker,companies(legal_name)").eq("is_primary", true).order("ticker");
  const field = "h-11 w-full rounded border border-line bg-bg px-3 text-ink";
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Companies</h1>
      {sp.error ? <p role="alert" className="text-sm text-danger">{sp.error}</p> : null}
      {sp.created ? <p className="text-sm text-accent">Created {sp.created}. It stays private until research is published.</p> : null}
      <Card className="divide-y divide-line">
        {(data ?? []).map((s: { ticker: string; companies: { legal_name: string } | { legal_name: string }[] | null }) => {
          const c = Array.isArray(s.companies) ? s.companies[0] : s.companies;
          return <div key={s.ticker} className="flex items-center justify-between gap-3 p-3 text-sm"><span className="truncate">{c?.legal_name}</span><span className="font-mono text-muted">{s.ticker}</span></div>;
        })}
        {!data?.length ? <div className="p-3 text-sm text-muted">No companies yet. Add one below before importing its workbook.</div> : null}
      </Card>
      <form action={createCompany} className="max-w-md space-y-3">
        <h2 className="font-semibold">Add a company</h2>
        <label className="block text-sm"><span className="text-muted">Ticker</span><input name="ticker" required className={field} placeholder="e.g. BATBC" autoCapitalize="characters" /></label>
        <label className="block text-sm"><span className="text-muted">Legal name</span><input name="legalName" required className={field} /></label>
        <label className="block text-sm"><span className="text-muted">Sector type</span>
          <select name="sector" className={field} defaultValue="INDUSTRIAL"><option value="INDUSTRIAL">Industrial / consumer</option><option value="BANK">Bank</option><option value="INSURANCE">Insurance</option></select>
        </label>
        <Button type="submit">Add company</Button>
      </form>
    </div>
  );
}
