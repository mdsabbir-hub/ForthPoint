import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/public/format";
import type { PublicCompany } from "@/lib/public/queries";

const TABS = [
  { key: "overview", label: "Overview", path: "" },
  { key: "financials", label: "Financials", path: "/financials" },
  { key: "ratios", label: "Ratios", path: "/ratios" },
] as const;

export function CompanyHeader({ company, active, publishedAt }: { company: PublicCompany; active: (typeof TABS)[number]["key"]; publishedAt: string | null }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <span className="font-mono text-sm text-muted">{company.ticker} · {company.exchange}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {company.sector ?? "Sector unavailable"}
        {publishedAt ? ` · Research published ${formatDate(publishedAt)}` : ""}
      </p>
      <nav className="mt-4 flex gap-5 overflow-x-auto whitespace-nowrap border-b border-line text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/companies/${company.ticker}${t.path}`}
            className={cn("-mb-px border-b-2 pb-2", active === t.key ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
