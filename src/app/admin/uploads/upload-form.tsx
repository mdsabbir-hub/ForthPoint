"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { XLSX_MIME } from "@/lib/imports/constants";

type Company = { id: string; label: string };
type Status = "queued" | "preparing" | "uploading" | "processing" | "done" | "failed";
type Item = { key: number; file: File; status: Status; message?: string; jobId?: string };

export function UploadForm({ companies }: { companies: Company[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  function add(files: FileList | File[]) {
    const next = Array.from(files).map((file) => ({ key: counter.current++, file, status: "queued" as Status }));
    setItems((cur) => [...cur, ...next]);
  }
  const patch = (key: number, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function start() {
    const queued = items.filter((i) => i.status === "queued");
    if (queued.length === 0) return;
    setBusy(true);
    queued.forEach((i) => patch(i.key, { status: "preparing", message: undefined }));
    try {
      const res = await fetch("/api/imports/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: companyId || null, files: queued.map((i) => ({ name: i.file.name, size: i.file.size, type: i.file.type })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload could not start.");
      const supabase = createClient();
      for (const entry of data.items as Array<{ index: number; jobId?: string; path?: string; token?: string; error?: string }>) {
        const item = queued[entry.index];
        if (!item) continue;
        if (entry.error || !entry.jobId || !entry.path || !entry.token) { patch(item.key, { status: "failed", message: entry.error ?? "Could not prepare." }); continue; }
        patch(item.key, { status: "uploading", jobId: entry.jobId });
        const up = await supabase.storage.from("company-workbooks").uploadToSignedUrl(entry.path, entry.token, item.file, { contentType: item.file.type || XLSX_MIME });
        if (up.error) { patch(item.key, { status: "failed", message: "Upload failed. Try again." }); continue; }
        patch(item.key, { status: "processing" });
        const pr = await fetch(`/api/imports/${entry.jobId}/process`, { method: "POST" });
        const out = await pr.json().catch(() => ({}));
        if (!pr.ok) { patch(item.key, { status: "failed", message: out.error ?? "Processing failed." }); continue; }
        patch(item.key, { status: "done", message: `${out.metrics} values, ${out.errors} errors, ${out.warnings} warnings` });
      }
    } catch (e) {
      queued.forEach((i) => patch(i.key, { status: "failed", message: e instanceof Error ? e.message : "Upload failed." }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-muted">Company (optional)</span>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1 h-11 w-full rounded border border-line bg-bg px-3 text-ink">
          <option value="">Detect from the workbook ticker</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={`rounded-md border border-dashed p-8 text-center ${drag ? "border-accent bg-raised" : "border-line"}`}
      >
        <p className="text-sm text-muted">Drop .xlsx workbooks here, or</p>
        <Button type="button" variant="ghost" className="mt-3" onClick={() => input.current?.click()}>Choose files</Button>
        <input ref={input} type="file" multiple accept=".xlsx" className="hidden" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>
      {items.length > 0 ? (
        <Card className="divide-y divide-line">
          {items.map((i) => (
            <div key={i.key} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <div className="truncate">{i.file.name}</div>
                <div className="text-xs text-muted">{(i.file.size / 1024).toFixed(0)} KB{i.message ? ` · ${i.message}` : ""}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`font-mono text-xs ${i.status === "failed" ? "text-danger" : i.status === "done" ? "text-accent" : "text-muted"}`}>{i.status}</span>
                {i.jobId && i.status !== "queued" ? <Link href={`/admin/imports/${i.jobId}`} className="text-accent">Open</Link> : null}
              </div>
            </div>
          ))}
        </Card>
      ) : null}
      <div className="flex gap-3">
        <Button type="button" onClick={start} disabled={busy || !items.some((i) => i.status === "queued")}>{busy ? "Working" : "Upload and process"}</Button>
        {items.length > 0 && !busy ? <Button type="button" variant="ghost" onClick={() => setItems([])}>Clear</Button> : null}
      </div>
    </div>
  );
}
