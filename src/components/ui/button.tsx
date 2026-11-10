import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" };

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded px-4 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary" && "bg-accent text-bg hover:bg-accent/90",
        variant === "ghost" && "border border-line text-ink hover:bg-raised",
        className,
      )}
      {...props}
    />
  );
}
