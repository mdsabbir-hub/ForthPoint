import { notFound } from "next/navigation";
import { FinancialRatioChart } from "@/components/charts/financial-ratio-chart";
import { CompanyHeader } from "@/components/companies/company-header";
import { FinancialTable, TableLegend } from "@/components/companies/financial-table";
import { PeriodSwitch } from "@/components/companies/period-switch";
import { Notice, PublicShell } from "@/components/companies/public-shell";
import { Card } from "@/components/ui/card";
import { STATEMENTS } from "@/lib/finance/statements";
import { formatDate } from "@/lib/public/format";
import { chartSeries, hasAnyValue, pivot, type PeriodGroup } from "@/lib/public/pivot";
import { loadCompanyData } from "@/lib/public/queries";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function RatiosPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<{ period?: string }> }) {
  const { ticker: raw } = await params;
  const sp = await searchParams;
  const ticker = raw.toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,11}$/.test(ticker)) notFound();
  const group: PeriodGroup = sp.period === "interim" ? "interim" : "annual";
  const db = createPublicClient();
  if (!db) return <PublicShell><Notice title="Data unavailable">The site is not configured yet: the Supabase environment variables are missing in this deployment.</Notice></PublicShell>;

  const data = await loadCompanyData(db, ticker);
  if (data.status === "missing") notFound();
  if (data.status === "error") return <PublicShell><Notice title="Data unavailable">Research data is temporarily unavailable.</Notice></PublicShell>;
  const { company, metrics, publishedAt } = data;

  const ratios = pivot(metrics, STATEMENTS.ratios.items, group);
  const margins = chartSeries(ratios, ["GROSS_MARGIN", "OPERATING_MARGIN", "NET_MARGIN", "FCF_MARGIN"]);
  const returns = chartSeries(ratios, ["ROE"]);

  return (
    <PublicShell>
      <CompanyHeader company={company} active="ratios" publishedAt={publishedAt} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodSwitch base={`/companies/${company.ticker}/ratios`} active={group} />
        {publishedAt ? <span className="text-xs text-muted">Source: ForthPoint research workbook, published {formatDate(publishedAt)}</span> : null}
      </div>
      <div className="space-y-8">
        <FinancialTable title={STATEMENTS.ratios.title} result={ratios} />
        {hasAnyValue(margins, ["GROSS_MARGIN", "OPERATING_MARGIN", "NET_MARGIN", "FCF_MARGIN"]) ? (
          <Card className="space-y-1 p-3"><div className="text-sm text-muted">Margins</div>
            <FinancialRatioChart data={margins} series={[{ key: "GROSS_MARGIN", label: "Gross margin" }, { key: "OPERATING_MARGIN", label: "Operating margin" }, { key: "NET_MARGIN", label: "Net margin" }, { key: "FCF_MARGIN", label: "FCF margin" }]} /></Card>
        ) : null}
        {hasAnyValue(returns, ["ROE"]) ? (
          <Card className="space-y-1 p-3"><div className="text-sm text-muted">Return on equity (average equity where the workbook supports it)</div>
            <FinancialRatioChart data={returns} height={220} series={[{ key: "ROE", label: "ROE" }]} /></Card>
        ) : null}
        <TableLegend />
      </div>
    </PublicShell>
  );
}
