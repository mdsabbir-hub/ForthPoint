import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/roles";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, roles } = await requirePermission("admin.access");
  const nav = [
    { href: "/admin", label: "Dashboard", show: true },
    { href: "/admin/uploads", label: "Upload", show: can(roles, "import.upload") },
    { href: "/admin/imports", label: "Imports", show: can(roles, "import.review") },
    { href: "/admin/publications", label: "Publications", show: can(roles, "import.review") },
    { href: "/admin/companies", label: "Companies", show: can(roles, "import.review") },
    { href: "/admin/templates", label: "Templates", show: can(roles, "import.review") },
    { href: "/admin/users", label: "Users", show: can(roles, "users.manage") },
    { href: "/admin/audit", label: "Audit log", show: can(roles, "audit.read") },
  ].filter((n) => n.show);

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <Brand />
        <form action="/auth/signout" method="post" className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{user.email} ({roles.join(", ")})</span>
          <Button variant="ghost" type="submit">Sign out</Button>
        </form>
      </header>
      <nav className="flex gap-5 overflow-x-auto whitespace-nowrap border-b border-line py-3 text-sm">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="text-muted hover:text-ink">{n.label}</Link>
        ))}
      </nav>
      <main className="py-6">{children}</main>
    </div>
  );
}
