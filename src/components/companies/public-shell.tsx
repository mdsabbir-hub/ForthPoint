import Link from "next/link";
import { Brand } from "@/components/layout/brand";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <Brand />
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/companies" className="text-muted hover:text-ink">Companies</Link>
          <Link href="/login" className="text-muted hover:text-ink">Sign in</Link>
        </nav>
      </header>
      <main className="flex-1 py-6">{children}</main>
      <footer className="border-t border-line pt-4 text-xs text-muted">
        ForthPoint research is for information only and is not investment advice. Figures come from reviewed and approved research workbooks.
      </footer>
    </div>
  );
}

export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4 text-sm">
      <div className="font-semibold">{title}</div>
      {children ? <div className="mt-1 text-muted">{children}</div> : null}
    </div>
  );
}
