import { randomUUID } from 'crypto';

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
 * Tạo yêu cầu chờ xác nhận — tool Mutation gọi hàm này thay vì ghi DB trực tiếp.
 * @returns Message tiếng Việt mô tả hành động, kèm pendingId.
 */
export function createPendingAction(
  description: string,
  action: () => Promise<unknown>,
): string {
  cleanExpired();
  const id = randomUUID().slice(0, 8);
  pendingActions.set(id, { description, action, createdAt: Date.now() });
  return `⚠️ **Xác nhận hành động**\n\n${description}\n\n🔑 Mã xác nhận: \`${id}\`\nHãy trả lời "xác nhận" để tôi thực hiện.`;
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
    return '❌ Không tìm thấy yêu cầu chờ xác nhận. Có thể đã hết hạn (5 phút).';
  }

  pendingActions.delete(pendingId);

  try {
    const result = await pending.action();
    return `✅ Đã thực hiện thành công!\n\n${JSON.stringify(result, null, 2)}`;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    return `❌ Lỗi khi thực thi: ${message}`;
  }
}

/**
 * Lấy danh sách pending actions (dùng cho debug / list).
 */
export function listPendingActions(): string {
  cleanExpired();
  if (pendingActions.size === 0) {
    return 'Không có yêu cầu nào đang chờ xác nhận.';
  }
  const lines = Array.from(pendingActions.entries()).map(
    ([id, pa]) => `- \`${id}\`: ${pa.description}`,
  );
  return `📋 **Yêu cầu đang chờ xác nhận:**\n\n${lines.join('\n')}`;
}
