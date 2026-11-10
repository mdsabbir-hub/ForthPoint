import { notFound } from "next/navigation";
import { FinancialAreaChart } from "@/components/charts/financial-area-chart";
import { FinancialBarChart } from "@/components/charts/financial-bar-chart";
import { FinancialLineChart } from "@/components/charts/financial-line-chart";
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

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function FinancialsPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<{ period?: string }> }) {
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

  const income = pivot(metrics, STATEMENTS.income.items, group);
  const balance = pivot(metrics, STATEMENTS.balance.items, group);
  const cash = pivot(metrics, STATEMENTS.cashflow.items, group);
  const incomeChart = chartSeries(income, ["REVENUE", "GROSS_PROFIT", "OPERATING_PROFIT", "NET_INCOME"]);
  const epsChart = chartSeries(income, ["EPS"]);
  const balanceChart = chartSeries(balance, ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY"]);
  const cashChart = chartSeries(cash, ["OPERATING_CASH_FLOW", "FREE_CASH_FLOW"]);

  return (
    <PublicShell>
      <CompanyHeader company={company} active="financials" publishedAt={publishedAt} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodSwitch base={`/companies/${company.ticker}/financials`} active={group} />
        {publishedAt ? <span className="text-xs text-muted">Source: ForthPoint research workbook, published {formatDate(publishedAt)}</span> : null}
      </div>

      <div className="space-y-8">
        <FinancialTable title={STATEMENTS.income.title} result={income} />
        {hasAnyValue(incomeChart, ["REVENUE", "NET_INCOME"]) ? (
          <Card className="p-3"><FinancialBarChart data={incomeChart} unitLabel="BDT mn" format={money} series={[{ key: "REVENUE", label: "Net revenue" }, { key: "GROSS_PROFIT", label: "Gross profit" }, { key: "OPERATING_PROFIT", label: "Operating profit" }, { key: "NET_INCOME", label: "Net income" }]} /></Card>
        ) : null}
        {hasAnyValue(epsChart, ["EPS"]) ? (
          <Card className="space-y-1 p-3"><div className="text-sm text-muted">Earnings per share</div><FinancialLineChart data={epsChart} unitLabel="BDT per share" format={(n: number) => n.toFixed(2)} height={220} series={[{ key: "EPS", label: "EPS" }]} /></Card>
        ) : null}

        <FinancialTable title={STATEMENTS.balance.title} result={balance} />
        {hasAnyValue(balanceChart, ["TOTAL_ASSETS"]) ? (
          <Card className="p-3"><FinancialAreaChart data={balanceChart} unitLabel="BDT mn" format={money} series={[{ key: "TOTAL_ASSETS", label: "Total assets" }, { key: "TOTAL_LIABILITIES", label: "Total liabilities" }, { key: "TOTAL_EQUITY", label: "Total equity" }]} /></Card>
        ) : null}

        <FinancialTable title={STATEMENTS.cashflow.title} result={cash} />
        {hasAnyValue(cashChart, ["OPERATING_CASH_FLOW", "FREE_CASH_FLOW"]) ? (
          <Card className="p-3"><FinancialBarChart data={cashChart} unitLabel="BDT mn" format={money} series={[{ key: "OPERATING_CASH_FLOW", label: "Operating cash flow" }, { key: "FREE_CASH_FLOW", label: "Free cash flow" }]} /></Card>
        ) : null}
        <TableLegend />
      </div>
    </PublicShell>
  );
}
