import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  ERROR: "border-danger/50 text-danger", failed: "border-danger/50 text-danger",
  WARNING: "border-warn/50 text-warn", needs_review: "border-warn/50 text-warn", processing: "border-warn/50 text-warn",
  INFO: "border-line text-muted", uploaded: "border-line text-muted",
  approved: "border-accent/50 text-accent", published: "border-accent/50 text-accent",
};

export function Badge({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("inline-block rounded border px-2 py-0.5 font-mono text-xs", tone[value] ?? "border-line text-muted", className)}>
      {value.replace("_", " ")}
    </span>
  );
}
