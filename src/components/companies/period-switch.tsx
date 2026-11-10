import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PeriodGroup } from "@/lib/public/pivot";

export function PeriodSwitch({ base, active }: { base: string; active: PeriodGroup }) {
  const item = (key: PeriodGroup, label: string) => (
    <Link href={`${base}?period=${key}`} className={cn("rounded px-3 py-1.5 text-sm", active === key ? "bg-raised text-ink" : "text-muted hover:text-ink")}>{label}</Link>
  );
  return <div className="inline-flex gap-1 rounded border border-line p-1">{item("annual", "Annual")}{item("interim", "Interim")}</div>;
}
