import Link from "next/link";
import { notFound } from "next/navigation";
import { FinancialBarChart } from "@/components/charts/financial-bar-chart";
import { FinancialRatioChart } from "@/components/charts/financial-ratio-chart";
import { CompanyHeader } from "@/components/companies/company-header";
import { Notice, PublicShell } from "@/components/companies/public-shell";
import { Card, Stat } from "@/components/ui/card";
import { STATEMENTS } from "@/lib/finance/statements";
import { classificationMark, formatDate, formatValue, unitLabel } from "@/lib/public/format";
import { chartSeries, hasAnyValue, latestAnnual, pivot } from "@/lib/public/pivot";
import { loadCompanyData, loadOverviewExtras } from "@/lib/public/queries";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

const KEY_METRICS = [
  { code: "REVENUE", label: "Net revenue" }, { code: "NET_INCOME", label: "Net income" }, { code: "EPS", label: "Earnings per share" },
  { code: "GROSS_MARGIN", label: "Gross margin" }, { code: "OPERATING_MARGIN", label: "Operating margin" }, { code: "ROE", label: "Return on equity" },
];

export default async function CompanyOverview({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = raw.toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,11}$/.test(ticker)) notFound();
  const db = createPublicClient();
  if (!db) return <PublicShell><Notice title="Data unavailable">The site is not configured yet: the Supabase environment variables are missing in this deployment.</Notice></PublicShell>;

  const data = await loadCompanyData(db, ticker);
  if (data.status === "missing") notFound();
  if (data.status === "error") return <PublicShell><Notice title="Data unavailable">Research data is temporarily unavailable.</Notice></PublicShell>;
  const { company, metrics, publishedAt } = data;
  const { profile, price, report } = await loadOverviewExtras(db, company);

  const annual = pivot(metrics, [...STATEMENTS.income.items, ...STATEMENTS.ratios.items], "annual");
  const money = chartSeries(annual, ["REVENUE", "NET_INCOME"]);
  const margins = chartSeries(annual, ["GROSS_MARGIN", "OPERATING_MARGIN", "NET_MARGIN"]);

  return (
    <PublicShell>
      <CompanyHeader company={company} active="overview" publishedAt={publishedAt} />
      {profile?.description ? <p className="mb-6 max-w-2xl text-sm text-muted">{profile.description}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Last share price" value={price ? `${price.currency} ${formatValue(price.price, "per_share")}` : null} note={price ? `As of ${formatDate(price.date)}` : "No price data has been published."} />
        <Stat label="Market capitalisation" value={null} note="No market capitalisation has been published." />
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="font-semibold">Key figures</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {KEY_METRICS.map((k) => {
            const v = latestAnnual(metrics, k.code);
            return (
              <Stat key={k.code} label={k.label} value={v ? formatValue(v.value, v.unit) : null}
                note={v ? `${v.periodLabel} · ${unitLabel(v.unit, v.currency)}${classificationMark(v.classification) ? ` · ${classificationMark(v.classification)}` : ""}` : "Not in the published research."} />
            );
          })}
        </div>
        <p className="text-xs text-muted">Latest actual annual figures. C calculated, N normalized, E estimate.</p>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-semibold">Revenue and net income</h2>
          {hasAnyValue(money, ["REVENUE", "NET_INCOME"]) ? (
            <Card className="p-3"><FinancialBarChart data={money} unitLabel="BDT mn" format={(n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 })} series={[{ key: "REVENUE", label: "Net revenue" }, { key: "NET_INCOME", label: "Net income" }]} /></Card>
          ) : <Notice title="Data unavailable" />}
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">Margins</h2>
          {hasAnyValue(margins, ["GROSS_MARGIN", "OPERATING_MARGIN", "NET_MARGIN"]) ? (
            <Card className="p-3"><FinancialRatioChart data={margins} series={[{ key: "GROSS_MARGIN", label: "Gross margin" }, { key: "OPERATING_MARGIN", label: "Operating margin" }, { key: "NET_MARGIN", label: "Net margin" }]} /></Card>
          ) : <Notice title="Data unavailable" />}
        </div>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="font-semibold">Latest research report</h2>
        {report ? <Notice title={report.title}>{report.reportDate ? `Dated ${formatDate(report.reportDate)}` : null}</Notice> : <Notice title="No research report has been published yet." />}
        <p className="text-sm"><Link href={`/companies/${company.ticker}/financials`} className="text-accent">View financial statements</Link></p>
      </section>
    </PublicShell>
  );
}
