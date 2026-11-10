"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReprocessButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/imports/${jobId}/process`, { method: "POST" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(out.error ?? "Processing failed.");
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="space-y-2">
      <Button variant="ghost" onClick={run} disabled={busy}>{busy ? "Processing" : "Re-process"}</Button>
      {message ? <p role="alert" className="text-sm text-danger">{message}</p> : null}
    </div>
  );
}
