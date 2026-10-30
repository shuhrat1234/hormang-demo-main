/**
 * report-store.ts
 * User Report System — reports are submitted/reviewed against the real
 * backend (requireAuth for submission, admin-key for review) so a report
 * filed by a user reaches every admin/device, not just the filer's browser.
 *
 * Block/unblock stays local — a per-viewer safety toggle, not admin-facing,
 * so per-browser storage is an acceptable tradeoff for now.
 *
 * Storage key: hormang_blocked_users_<uid> — string[] of blocked userIds (per blocker)
 */
import { apiFetch } from "@/lib/api-client";
import { adminFetch } from "@/lib/admin-client";
import { emitStoreChange } from "@/lib/store-events";

export type ReportReason =
  | "spam"
  | "fake_profile"
  | "abuse"
  | "fraud"
  | "inappropriate_content"
  | "outside_contact"
  | "other";

export type ReportStatus = "new" | "in_review" | "resolved" | "dismissed";

export type ReportSource = "profile" | "chat";

export interface UserReport {
  id: string;
  reporterUserId: string;
  reportedUserId: string;
  reason: ReportReason;
  description?: string;
  attachments?: string[];
  status: ReportStatus;
  adminNote?: string;
  createdAt: string;
  /** Where the report was filed from. Defaults to "profile" for legacy entries. */
  source?: ReportSource;
  /** Set when source === "chat". */
  chatId?: string;
  /** Optional context — last message id at the time of the report. */
  lastMessageId?: string;
}

/* ── Submit / admin review — real backend ────────────────────────────── */

export async function submitReport(
  data: Omit<UserReport, "id" | "status" | "createdAt">,
): Promise<UserReport> {
  const { report } = await apiFetch<{ report: UserReport }>("/reports", { method: "POST", body: data });
  return report;
}

export async function getReportCountForUser(userId: string): Promise<number> {
  const { count } = await apiFetch<{ count: number }>(`/reports/count/${userId}`);
  return count;
}

export async function getAllReports(): Promise<UserReport[]> {
  const { reports } = await adminFetch<{ reports: UserReport[] }>("/reports/admin");
  return reports;
}

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  adminNote?: string,
): Promise<UserReport> {
  const { report } = await adminFetch<{ report: UserReport }>(`/reports/admin/${reportId}/status`, {
    method: "PATCH",
    body: { status, adminNote },
  });
  return report;
}

/* ── Public API — block/unblock (local, per-viewer) ─────────────────── */

const BLOCKED_PREFIX = "hormang_blocked_users_";

function readBlocked(userId: string): string[] {
  try {
    const raw = localStorage.getItem(BLOCKED_PREFIX + userId);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeBlocked(userId: string, ids: string[]): void {
  localStorage.setItem(BLOCKED_PREFIX + userId, JSON.stringify(ids));
  emitStoreChange();
}

export function blockUser(blockerId: string, blockedId: string): void {
  const ids = readBlocked(blockerId);
  if (!ids.includes(blockedId)) writeBlocked(blockerId, [...ids, blockedId]);
}

export function unblockUser(blockerId: string, blockedId: string): void {
  writeBlocked(blockerId, readBlocked(blockerId).filter((id) => id !== blockedId));
}

export function isBlockedBy(viewerId: string, targetId: string): boolean {
  return readBlocked(viewerId).includes(targetId);
}

export function getBlockedUsers(userId: string): string[] {
  return readBlocked(userId);
}
