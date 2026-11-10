export type Scale = "units" | "thousand" | "million" | "billion" | "crore";

export interface UnitLabel {
  currency: string | null;
  scale: Scale | null;
  perShareExcepted: boolean;
}

export function parseUnitLabel(text: string): UnitLabel {
  const t = text.toLowerCase();
  const cur = /\b(bdt|usd|gbp|tk|taka)\b/.exec(t);
  let currency: string | null = null;
  if (cur) currency = cur[1] === "tk" || cur[1] === "taka" ? "BDT" : cur[1].toUpperCase();
  let scale: Scale | null = null;
  if (/\b(mn|mm|million|millions)\b/.test(t)) scale = "million";
  else if (/\b(bn|billion|billions)\b/.test(t)) scale = "billion";
  else if (/\b(crore|crores|cr)\b/.test(t)) scale = "crore";
  else if (/\b(thousand|thousands)\b|'000/.test(t)) scale = "thousand";
  return { currency, scale, perShareExcepted: /except\s+(eps|per[- ]?share)/.test(t) };
}

export function toMillions(value: number, scale: Scale): number {
  switch (scale) {
    case "units": return value / 1_000_000;
    case "thousand": return value / 1_000;
    case "million": return value;
    case "billion": return value * 1_000;
    case "crore": return value * 10;
  }
}
