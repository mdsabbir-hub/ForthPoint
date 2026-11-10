import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border border-line bg-surface rounded-md", className)} {...props} />;
}

export function Stat({ label, value, note }: { label: string; value: string | number | null; note?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 font-mono text-2xl">{value ?? "Data unavailable"}</div>
      {note ? <div className="mt-1 text-xs text-muted">{note}</div> : null}
    </Card>
  );
}
