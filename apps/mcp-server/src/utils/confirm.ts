import { randomUUID } from 'crypto';
import { t } from './i18n';

/**
 * Mutation Confirmation Pattern
 *
 * Mọi tool dạng Mutation (create/update/delete) phải qua 2 bước:
 * 1. Tool trả về message mô tả + pendingId
 * 2. Admin gõ "xác nhận" → LLM gọi confirm_action(pendingId) → thực thi
 *
 * Lưu ý: Store này in-memory, phù hợp cho Stdio (1 session).
 * Khi chuyển sang SSE multi-session, cần dùng Redis.
 */

interface PendingAction {
  description: string;
  lang: string;
  action: () => Promise<unknown>;
  createdAt: number;
}

const pendingActions = new Map<string, PendingAction>();

// Auto-clean pending actions sau 5 phút
const PENDING_TTL_MS = 5 * 60 * 1000;

function cleanExpired(): void {
  const now = Date.now();
  for (const [id, pa] of pendingActions) {
    if (now - pa.createdAt > PENDING_TTL_MS) {
      pendingActions.delete(id);
    }
  }
}

/**
 * Tạo yêu cầu chờ xác nhận cho Admin, hoặc thực thi ngay nếu là End-User (có userId).
 * @returns Message mô tả kết quả hoặc yêu cầu xác nhận.
 */
export async function createOrExecuteAction(
  lang: string,
  description: string,
  action: () => Promise<unknown>,
  userId?: string,
): Promise<string> {
  // End-User via Voice/App is already JWT authenticated, execute immediately
  if (userId) {
    try {
      const result = await action();
      return t(lang, 'confirm.success', { result: JSON.stringify(result, null, 2) });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return t(lang, 'confirm.error', { message });
    }
  }

  // Admin flow: wait for explicit confirmation
  cleanExpired();
  const id = randomUUID().slice(0, 8);
  pendingActions.set(id, { description, lang, action, createdAt: Date.now() });
  return t(lang, 'confirm.title', { description, id });
}

/**
 * @deprecated Use createOrExecuteAction instead.
 */
export function createPendingAction(
  lang: string,
  description: string,
  action: () => Promise<unknown>,
): string {
  cleanExpired();
  const id = randomUUID().slice(0, 8);
  pendingActions.set(id, { description, lang, action, createdAt: Date.now() });
  return t(lang, 'confirm.title', { description, id });
}

/**
 * Thực thi yêu cầu đã được xác nhận.
 */
export async function executeConfirmedAction(
  pendingId: string,
): Promise<string> {
  cleanExpired();
  const pending = pendingActions.get(pendingId);
  if (!pending) {
    return t('vi', 'confirm.expired');
  }

  const { lang, action } = pending;
  pendingActions.delete(pendingId);

  try {
    const result = await action();
    return t(lang, 'confirm.success', { result: JSON.stringify(result, null, 2) });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return t(lang, 'confirm.error', { message });
  }
}

/**
 * Lấy danh sách pending actions (dùng cho debug / list).
 */
export function listPendingActions(lang = 'vi'): string {
  cleanExpired();
  if (pendingActions.size === 0) {
    return t(lang, 'confirm.empty');
  }
  const lines = Array.from(pendingActions.entries()).map(
    ([id, pa]) => `- \`${id}\`: ${pa.description}`,
  );
  return t(lang, 'confirm.list', { lines: lines.join('\n') });
}
