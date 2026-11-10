import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricRow } from "./pivot";

type Joined<T> = T | T[] | null;
const one = <T,>(v: Joined<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export interface PublicCompany {
  id: string;
  securityId: string;
  ticker: string;
  name: string;
  exchange: string;
  sector: string | null;
  sectorType: string | null;
}

type SecRow = {
  id: string; ticker: string; company_id: string;
  companies: Joined<{ legal_name: string; exchange: string; sectors: Joined<{ name: string; sector_type: string }> }>;
};
const SEC_SELECT = "id,ticker,company_id,companies(legal_name,exchange,sectors(name,sector_type))";

function toCompany(r: SecRow): PublicCompany {
  const c = one(r.companies);
  const s = c ? one(c.sectors) : null;
  return { id: r.company_id, securityId: r.id, ticker: r.ticker, name: c?.legal_name ?? r.ticker, exchange: c?.exchange ?? "DSE", sector: s?.name ?? null, sectorType: s?.sector_type ?? null };
}

/** Only companies with a current publication are visible (enforced by Row Level Security). */
export async function listCompanies(db: SupabaseClient): Promise<PublicCompany[]> {
  const { data, error } = await db.from("securities").select(SEC_SELECT).eq("is_primary", true).order("ticker");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SecRow[]).map(toCompany);
}

export async function getCompany(db: SupabaseClient, ticker: string): Promise<PublicCompany | null> {
  const { data, error } = await db.from("securities").select(SEC_SELECT).eq("ticker", ticker).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toCompany(data as unknown as SecRow) : null;
}

const PAGE = 1000;

export async function loadMetrics(db: SupabaseClient, companyId: string): Promise<MetricRow[]> {
  const out: MetricRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("financial_metrics")
      .select("value,unit,currency,classification,metric_definitions(code),reporting_periods(label,period_type,period_end,is_forecast)")
      .eq("company_id", companyId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const def = one(r.metric_definitions as Joined<{ code: string }>);
      const per = one(r.reporting_periods as Joined<{ label: string; period_type: string; period_end: string; is_forecast: boolean }>);
      if (!def || !per) continue;
      out.push({
        code: def.code, value: Number(r.value), unit: String(r.unit), currency: (r.currency as string | null) ?? null, classification: String(r.classification),
        period: { label: per.label, type: per.period_type, endDate: per.period_end, isForecast: per.is_forecast },
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function getPublishedAt(db: SupabaseClient, companyId: string): Promise<string | null> {
  const { data } = await db.from("publication_versions").select("published_at").eq("company_id", companyId).eq("is_current", true).maybeSingle();
  return (data?.published_at as string | undefined) ?? null;
}

export async function getProfile(db: SupabaseClient, companyId: string): Promise<{ description: string | null; website: string | null } | null> {
  const { data } = await db.from("company_profiles").select("description,website").eq("company_id", companyId).maybeSingle();
  return data ? { description: data.description ?? null, website: data.website ?? null } : null;
}

export async function getLastPrice(db: SupabaseClient, securityId: string): Promise<{ price: number; date: string; currency: string } | null> {
  const { data } = await db.from("market_prices").select("close_price,price_date,currency").eq("security_id", securityId).order("price_date", { ascending: false }).limit(1);
  const r = data?.[0];
  return r ? { price: Number(r.close_price), date: r.price_date as string, currency: r.currency as string } : null;
}

export async function getLatestReport(db: SupabaseClient, companyId: string): Promise<{ title: string; reportDate: string | null } | null> {
  const { data } = await db.from("research_reports").select("title,report_date").eq("company_id", companyId).eq("is_published", true).order("report_date", { ascending: false }).limit(1);
  const r = data?.[0];
  return r ? { title: r.title as string, reportDate: (r.report_date as string | null) ?? null } : null;
}

export type CompanyData =
  | { status: "ok"; company: PublicCompany; metrics: MetricRow[]; publishedAt: string | null }
  | { status: "missing" }
  | { status: "error" };

/** Loads what every company page needs. Unpublished companies come back as "missing", never as an error. */
export async function loadCompanyData(db: SupabaseClient, ticker: string): Promise<CompanyData> {
  try {
    const company = await getCompany(db, ticker);
    if (!company) return { status: "missing" };
    const [metrics, publishedAt] = await Promise.all([loadMetrics(db, company.id), getPublishedAt(db, company.id)]);
    return { status: "ok", company, metrics, publishedAt };
  } catch (e) {
    console.error("loadCompanyData failed", e);
    return { status: "error" };
  }
}

export interface OverviewExtras {
  profile: { description: string | null; website: string | null } | null;
  price: { price: number; date: string; currency: string } | null;
  report: { title: string; reportDate: string | null } | null;
}

/** Optional extras. A failure here must not break the page, so each falls back to "unavailable". */
export async function loadOverviewExtras(db: SupabaseClient, company: PublicCompany): Promise<OverviewExtras> {
  const safe = async <T,>(f: () => Promise<T | null>): Promise<T | null> => { try { return await f(); } catch { return null; } };
  const [profile, price, report] = await Promise.all([
    safe(() => getProfile(db, company.id)), safe(() => getLastPrice(db, company.securityId)), safe(() => getLatestReport(db, company.id)),
  ]);
  return { profile, price, report };
}
