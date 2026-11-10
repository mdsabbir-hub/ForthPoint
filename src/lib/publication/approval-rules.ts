/** Mirrors the checks in the approve_import / publish_snapshot SQL functions, to explain blockers in the UI. The database is authoritative. */
export interface ApprovalState {
  jobStatus: string;
  unresolvedErrors: number;
  unresolvedWarnings: number;
  rejectedDiffs: number;
  hasDraftSnapshot: boolean;
}

export function approvalBlockers(s: ApprovalState): string[] {
  const out: string[] = [];
  if (s.jobStatus !== "needs_review") out.push(`Only imports awaiting review can be approved (status is ${s.jobStatus}).`);
  if (!s.hasDraftSnapshot) out.push("There is no draft snapshot to approve.");
  if (s.unresolvedErrors > 0) out.push(`${s.unresolvedErrors} error(s) must be fixed in the workbook and the file uploaded again.`);
  if (s.rejectedDiffs > 0) out.push(`${s.rejectedDiffs} change(s) are marked rejected.`);
  return out;
}

export function needsWarningAcknowledgement(s: ApprovalState): boolean {
  return s.unresolvedWarnings > 0;
}

export function publishBlockers(jobStatus: string, unresolvedErrors: number): string[] {
  const out: string[] = [];
  if (jobStatus !== "approved") out.push(`Only an approved import can be published (status is ${jobStatus}).`);
  if (unresolvedErrors > 0) out.push(`${unresolvedErrors} unresolved error(s) block publication.`);
  return out;
}
