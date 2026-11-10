import Link from "next/link";
import { Notice, PublicShell } from "@/components/companies/public-shell";
import { Button } from "@/components/ui/button";
import { listCompanies, type PublicCompany } from "@/lib/public/queries";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().slice(0, 60);
  const db = createPublicClient();
  let companies: PublicCompany[] = [];
  let problem: string | null = null;
  if (!db) problem = "The site is not configured yet: the Supabase environment variables are missing in this deployment.";
  else {
    try {
      companies = await listCompanies(db);
    } catch (e) {
      console.error("companies: listing failed", e);
      problem = "Research data is temporarily unavailable.";
    }
  }
  const needle = query.toLowerCase();
  const shown = needle ? companies.filter((c) => c.name.toLowerCase().includes(needle) || c.ticker.toLowerCase().includes(needle) || (c.sector ?? "").toLowerCase().includes(needle)) : companies;

  return (
    <PublicShell>
      <h1 className="text-2xl font-semibold">Companies</h1>
      <form className="mt-4 flex gap-2" action="/companies">
        <input name="q" defaultValue={query} placeholder="Search by name, ticker or sector" aria-label="Search companies" className="h-11 min-w-0 flex-1 rounded border border-line bg-bg px-3 text-ink" />
        <Button type="submit">Search</Button>
      </form>
      <div className="mt-6 space-y-3">
        {problem ? <Notice title="Data unavailable">{problem}</Notice> : null}
        {!problem && companies.length === 0 ? <Notice title="No research has been published yet" /> : null}
        {!problem && companies.length > 0 && shown.length === 0 ? <Notice title="No companies match your search" /> : null}
        {shown.map((c) => (
          <Link key={c.ticker} href={`/companies/${c.ticker}`} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-4 hover:bg-raised">
            <div className="min-w-0"><div className="truncate font-semibold">{c.name}</div><div className="text-sm text-muted">{c.sector ?? "Sector unavailable"}</div></div>
            <span className="shrink-0 font-mono text-sm text-muted">{c.ticker}</span>
          </Link>
        ))}
      </div>
    </PublicShell>
  );
}
