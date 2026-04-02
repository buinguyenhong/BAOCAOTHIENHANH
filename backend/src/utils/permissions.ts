/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  PERMISSIONS UTILITY — Shared action permission helpers                     │
 * │                                                                          │
 * │  Dùng chung cho report.routes.ts và user.routes.ts.                        │
 * │  Tránh duplicate logic checkActionPermission ở nhiều nơi.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { AuthRequest } from '../middleware/auth.middleware.js';
import { authService } from '../services/auth.service.js';

/**
 * Các action có thể kiểm tra qua UserPermissions.
 */
export type ActionPermissionKey =
  | 'canCreateReport'
  | 'canEditReport'
  | 'canDeleteReport'
  | 'canCreateGroup'
  | 'canEditGroup'
  | 'canDeleteGroup';

/**
 * Kiểm tra action permission cho current user.
 *
 * Quy tắc:
 *  • Admin luôn có mọi quyền (role='admin' → getUserActionPermissions trả true hết)
 *  • User thường → kiểm tra từ UserPermissions
 *
 * Dùng trong các route handler cần check quyền trước khi thực hiện action.
 *
 * @param req    Express request đã qua authMiddleware
 * @param action Action cần kiểm tra
 * @returns      true nếu được phép, false nếu không
 *
 * @example
 * const hasPerm = await checkActionPermission(req, 'canCreateReport');
 * if (!hasPerm) {
 *   return res.status(403).json({ error: 'Không có quyền' });
 * }
 */
export async function checkActionPermission(
  req: AuthRequest,
  action: ActionPermissionKey
): Promise<boolean> {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const perms = await authService.getUserActionPermissions(userId, role);
  return perms[action];
}
