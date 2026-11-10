import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="flex items-baseline gap-3">
      <span className="text-lg font-semibold tracking-wide">FORTHPOINT</span>
      <span className="hidden text-sm text-muted sm:inline">Equity Intelligence Terminal</span>
    </Link>
  );
}
