import Link from "next/link";
import { Notice, PublicShell } from "@/components/companies/public-shell";
import { Stat } from "@/components/ui/card";
import { listCompanies, type PublicCompany } from "@/lib/public/queries";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = createPublicClient();
  let companies: PublicCompany[] = [];
  let problem: string | null = null;
  if (!db) {
    problem = "The site is not configured yet: the Supabase environment variables are missing in this deployment.";
  } else {
    try {
      companies = await listCompanies(db);
    } catch (e) {
      console.error("home: listing companies failed", e);
      problem = "Research data is temporarily unavailable.";
    }
  }

  return (
    <PublicShell>
      <h1 className="max-w-xl text-3xl font-semibold leading-tight">Research on Bangladesh-listed companies, built from reviewed workbooks.</h1>
      <p className="mt-3 max-w-xl text-muted">Every figure comes from an approved research import. Anything without a published source is shown as unavailable.</p>
      {problem ? (
        <div className="mt-8"><Notice title="Data unavailable">{problem}</Notice></div>
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Stat label="Published companies" value={companies.length} note={companies.length === 0 ? "No research has been published yet." : undefined} />
          </div>
          {companies.length > 0 ? (
            <section className="mt-8 space-y-3">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Companies</h2><Link href="/companies" className="text-sm text-accent">Search all</Link></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {companies.slice(0, 12).map((c) => (
                  <Link key={c.ticker} href={`/companies/${c.ticker}`} className="rounded-md border border-line bg-surface p-4 hover:bg-raised">
                    <div className="flex items-baseline justify-between gap-3"><span className="truncate font-semibold">{c.name}</span><span className="font-mono text-sm text-muted">{c.ticker}</span></div>
                    <div className="mt-1 text-sm text-muted">{c.sector ?? "Sector unavailable"}</div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </PublicShell>
  );
}
