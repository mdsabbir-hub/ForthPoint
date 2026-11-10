const SCALE: Record<string, string> = { million: "mn", billion: "bn", crore: "crore", thousand: "000", units: "" };

/** Human label for a stored unit, e.g. "BDT mn", "BDT per share", "%". */
export function unitLabel(unit: string, currency: string | null): string {
  const cur = currency ?? "BDT";
  if (unit === "ratio") return "%";
  if (unit === "x") return "x";
  if (unit === "per_share") return `${cur} per share`;
  const scale = SCALE[unit];
  return scale === undefined ? unit : `${cur} ${scale}`.trim();
}

export function formatValue(value: number, unit: string): string {
  if (unit === "ratio") return `${(value * 100).toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(1)}x`;
  if (unit === "per_share") return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 1 });
}

/** Chart values: ratios are shown as percentages, everything else unchanged. */
export function chartNumber(value: number, unit: string): number {
  return unit === "ratio" ? value * 100 : value;
}

export function classificationMark(classification: string): "" | "C" | "N" | "E" {
  if (classification === "calculated") return "C";
  if (classification === "normalized") return "N";
  if (classification === "estimated") return "E";
  return "";
}

export function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
