import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware.js';
import { reportService } from '../services/report.service.js';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  PERMISSION MIDDLEWARE — Unified Permission System                        │
 * │                                                                          │
 * │  Permission check gồm 2 tầng:                                             │
 * │                                                                          │
 * │  Tầng 1 — ReportPermissions (per-report granular)                        │
 * │    • canView / canExport cho từng user × report cụ thể                  │
 * │    • Admin luôn có quyền (role='admin')                                 │
 * │                                                                          │
 * │  Tầng 2 — UserReportGroupPermissions (group-level)                      │
 * │    • User thuộc nhóm nào → thấy tất cả báo cáo trong nhóm đó            │
 * │    • Kết hợp với Tầng 1: user có nhóm NHƯNG bị chặn bởi ReportPermissions │
 * │      → nếu không có bản ghi trong ReportPermissions → được phép          │
 * │      → nếu có bản ghi với canView/canExport=false → bị chặn             │
 * │                                                                          │
 * │  MỌI middleware dùng HÀM NÀY — không có logic rẽ nhánh riêng.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Lấy action cần kiểm tra từ request query string.
 * Mặc định là 'canView' nếu không specify.
 */
function resolveAction(req: AuthRequest): 'canView' | 'canExport' {
  const action = (req.query as Record<string, string>).action;
  if (action === 'canExport') return 'canExport';
  return 'canView';
}

/**
 * Kiểm tra permission đầy đủ: admin bypass → ReportPermissions → default false.
 *
 * Flow:
 *  1. Admin → cho phép ngay
 *  2. Có bản ghi ReportPermissions → kiểm tra field tương ứng
 *  3. Không có bản ghi → fallback về UserReportGroupPermissions
 *     (user có nhóm → được xem, không có nhóm → bị chặn)
 *
 * FIX: Trước đây checkPermission chỉ dùng ReportPermissions.
 * Giờ kết hợp cả UserReportGroupPermissions:
 *   - User có nhóm nhưng không có ReportPermissions → được phép (trước đây bị chặn)
 *   - User có nhóm và có ReportPermissions=false → bị chặn (đúng)
 */
async function checkFullPermission(
  userId: string,
  reportId: string,
  role: string,
  action: 'canView' | 'canExport'
): Promise<boolean> {
  // Tầng 0: Admin luôn được phép
  if (role === 'admin') return true;

  // Tầng 1: Kiểm tra ReportPermissions (per-report granular)
  // Nếu có bản ghi → dùng giá trị trong đó
  const reportPerm = await reportService.checkPermission(userId, reportId, role);
  if (reportPerm[action] === true) return true;
  if (reportPerm[action] === false) return false;

  // Tầng 2: Không có ReportPermissions → fallback vào UserReportGroupPermissions
  const { authService } = await import('../services/auth.service.js');
  const userGroups = await authService.getUserReportGroupIds(userId);

  if (userGroups.length === 0) return false;

  // Lấy report để kiểm tra reportGroupId
  const report = reportService.getReportById(reportId);
  if (!report) return false;

  // Report có nhóm → user phải thuộc nhóm đó
  if ((report as any).reportGroupId) {
    return userGroups.includes((report as any).reportGroupId);
  }

  // Report không có nhóm (NULL) → user có NHÓM nào thì được xem
  return true;
}

// ─────────────────────────────────────────────
// Unified middleware factory
// ─────────────────────────────────────────────

/**
 * Middleware kiểm tra quyền xem hoặc export báo cáo.
 *
 * @param action — 'canView' (default) hoặc 'canExport'
 *
 * FIX: Thống nhất checkReportView và checkReportExport.
 * Trước đây 2 hàm riêng dẫn đến logic không đồng nhất.
 * Giờ dùng checkFullPermission — kiểm tra cả ReportPermissions
 * và UserReportGroupPermissions.
 */
export const checkReportPermission = (action?: 'canView' | 'canExport') => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Chưa đăng nhập' });
      return;
    }

    const reportId = req.params.id || req.params.reportId;
    if (!reportId) {
      res.status(400).json({ success: false, error: 'Thiếu report ID' });
      return;
    }

    const checkAction = action ?? resolveAction(req);

    try {
      const allowed = await checkFullPermission(
        req.user.userId,
        reportId as string,
        req.user.role,
        checkAction
      );

      if (!allowed) {
        const msg = checkAction === 'canExport'
          ? 'Bạn không có quyền xuất báo cáo này'
          : 'Bạn không có quyền xem báo cáo này';
        res.status(403).json({ success: false, error: msg });
        return;
      }
      next();
    } catch (err) {
      console.error('[Permission] checkReportPermission error:', err);
      res.status(500).json({ success: false, error: 'Lỗi kiểm tra quyền' });
    }
  };
};

// ─────────────────────────────────────────────
// Legacy exports (backward compat)
// ─────────────────────────────────────────────

/** Legacy: kiểm tra quyền xem báo cáo (dùng unified system) */
export const checkReportView = () => checkReportPermission('canView');

/** Legacy: kiểm tra quyền export báo cáo (dùng unified system) */
export const checkReportExport = () => checkReportPermission('canExport');
