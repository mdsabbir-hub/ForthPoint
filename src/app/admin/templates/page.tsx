import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TEMPLATES } from "@/lib/excel/import-pipeline";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requirePermission("import.review");
  const supabase = await createClient();
  const { data } = await supabase.from("workbook_templates").select("id,workbook_type,version,name,is_active").order("workbook_type").order("version");
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Workbook templates</h1>
      <p className="max-w-xl text-sm text-muted">Mapping templates are versioned in the application code. Changing one needs a code change and a new version number. Editing them from this screen is not built yet.</p>
      {TEMPLATES.map((t) => (
        <Card key={t.id} className="space-y-2 p-4 text-sm">
          <div className="flex items-center justify-between gap-3"><span className="font-semibold">{t.name}</span><span className="font-mono text-xs text-muted">{t.workbookType} v{t.version}</span></div>
          <p className="text-muted">Fiscal year ends in month {t.fiscalYearEndMonth}. Default unit: {t.currency} {t.defaultScale}.</p>
          <div className="space-y-1 font-mono text-xs">
            {t.sheets.map((s) => <div key={s.sheet} className="flex justify-between gap-3"><span>{s.sheet}{s.required ? " *" : ""}</span><span className="text-muted">{s.blocks.reduce((n, b) => n + b.rows.length, 0) + (s.cells?.length ?? 0)} mapped rows</span></div>)}
          </div>
          <p className="text-xs text-muted">* required worksheet. Validated against one workbook (BATBC). Other companies may need their own version.</p>
        </Card>
      ))}
      <div className="space-y-2">
        <h2 className="font-semibold">Registered versions</h2>
        <Card className="divide-y divide-line">
          {(data ?? []).map((t) => <div key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm"><span>{t.name}</span><Badge value={t.is_active ? "approved" : "uploaded"} /></div>)}
          {!data?.length ? <div className="p-3 text-sm text-muted">None registered. Run migration 006.</div> : null}
        </Card>
      </div>
    </div>
  );
}
