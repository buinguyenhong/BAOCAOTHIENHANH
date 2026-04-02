import { Router, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { reportService } from '../services/report.service.js';
import { auditService } from '../services/audit.service.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { checkActionPermission } from '../utils/permissions.js';

const router = Router();

// ─── User CRUD ─────────────────────────────────────────────────

// GET /api/users — Danh sách users (admin)
router.get(
  '/users',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const users = await authService.getAllUsersWithPermissions();
      res.json({ success: true, data: users });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/users — Tạo user mới (admin + quyền canCreateReport)
router.post(
  '/users',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { username, password, fullName, role, permissions, reportGroupIds } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username và password là bắt buộc' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password phải có ít nhất 6 ký tự' });
      }

      const existing = await authService.findByUsername(username);
      if (existing) {
        return res.status(400).json({ success: false, error: 'Username đã tồn tại' });
      }

      // permissions: action permissions (canCreateReport, canEditReport, ...)
      const permissionsDto = permissions ?? {
        canCreateReport: false,
        canEditReport: false,
        canDeleteReport: false,
        canCreateGroup: false,
        canEditGroup: false,
        canDeleteGroup: false,
      };
      const groupIds = Array.isArray(reportGroupIds) ? reportGroupIds : [];

      const result = await authService.createUserFull(
        { username, password, fullName, role },
        permissionsDto,
        groupIds
      );

      await auditService.log(
        'CREATE_USER',
        req.user!.userId,
        username,
        req.ip ?? null,
        `Tạo user ${username}, role=${role || 'user'}, nhóm=${groupIds.length}`
      );

      res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('Create user error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/users/:id — Chi tiết user (admin)
router.get(
  '/users/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await authService.getUserWithPermissions((req.params as any).id as string);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
      }
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/users/:id — Cập nhật user (admin)
router.put(
  '/users/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = (req.params as any).id as string;

      // Không cho tự sửa role của chính mình
      if (userId === req.user!.userId && req.body.role && req.body.role !== 'admin') {
        return res.status(400).json({ success: false, error: 'Không thể hạ role của chính mình' });
      }

      const { fullName, role, isActive, password, permissions, reportGroupIds } = req.body;

      // permissions: null/undefined = giữ nguyên, object = update
      const permissionsDto: any = permissions !== undefined ? permissions : null;

      // FIX: Chỉ cập nhật nhóm khi reportGroupIds thực sự được gửi lên.
      // Khi chỉ cập nhật thông tin cá nhân (fullName/role/isActive),
      // reportGroupIds sẽ là undefined → setUserReportGroups bị bỏ qua,
      // tránh xóa sạch nhóm báo cáo do fallback groupIds ?? [].
      //
      // - reportGroupIds được gửi (kể cả []): update nhóm = giá trị đó
      // - reportGroupIds không được gửi (undefined): giữ nguyên nhóm
      const groupIds: string[] | undefined =
        reportGroupIds !== undefined
          ? (Array.isArray(reportGroupIds) ? reportGroupIds : [])
          : undefined;

      const result = await authService.updateUserFull(
        userId,
        { fullName, role, isActive, password },
        permissionsDto,
        groupIds ?? []
      );

      if (!result) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
      }

      await auditService.log(
        'UPDATE_USER',
        req.user!.userId,
        result.user.username,
        req.ip ?? null,
        `Cập nhật: fullName=${fullName}, role=${role}, isActive=${isActive}`
      );

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/users/:id/reset-password — Reset password (admin)
router.post(
  '/users/:id/reset-password',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Password phải có ít nhất 6 ký tự' });
      }

      const user = await authService.findById((req.params as any).id as string);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
      }

      await authService.resetPassword((req.params as any).id as string, newPassword);

      await auditService.log(
        'UPDATE_USER',
        req.user!.userId,
        user.username,
        req.ip ?? null,
        'Reset password'
      );

      res.json({ success: true, message: 'Đặt lại mật khẩu thành công' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// DELETE /api/users/:id — Xóa user (admin)
router.delete(
  '/users/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = (req.params as any).id as string;

      if (userId === req.user!.userId) {
        return res.status(400).json({ success: false, error: 'Không thể xóa chính mình' });
      }

      const user = await authService.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
      }

      await authService.deleteUser(userId);

      await auditService.log(
        'DELETE_USER',
        req.user!.userId,
        user.username,
        req.ip ?? null,
        null
      );

      res.json({ success: true, message: 'Xóa user thành công' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Report Group CRUD ─────────────────────────────────────────

// GET /api/report-groups — Danh sách nhóm báo cáo (admin)
router.get(
  '/report-groups',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const groups = await authService.getAllReportGroups();
      res.json({ success: true, data: groups });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/report-groups — Tạo nhóm báo cáo (admin + canCreateGroup)
router.post(
  '/report-groups',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const hasPerm = await checkActionPermission(req, 'canCreateGroup');
      if (!hasPerm) {
        return res.status(403).json({ success: false, error: 'Bạn không có quyền thêm nhóm báo cáo' });
      }

      const { name, icon, displayOrder } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Tên nhóm báo cáo là bắt buộc' });
      }

      const group = await authService.createReportGroup({ name, icon, displayOrder });

      await auditService.log(
        'CREATE_REPORT',
        req.user!.userId,
        `Nhóm: ${name}`,
        req.ip ?? null,
        'Tạo nhóm báo cáo'
      );

      res.json({ success: true, data: group });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/report-groups/:id — Cập nhật nhóm báo cáo (admin + canEditGroup)
router.put(
  '/report-groups/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const hasPerm = await checkActionPermission(req, 'canEditGroup');
      if (!hasPerm) {
        return res.status(403).json({ success: false, error: 'Bạn không có quyền sửa nhóm báo cáo' });
      }

      const { name, icon, displayOrder } = req.body;
      const group = await authService.updateReportGroup((req.params as any).id as string, { name, icon, displayOrder });

      if (!group) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy nhóm báo cáo' });
      }

      await auditService.log(
        'UPDATE_REPORT',
        req.user!.userId,
        `Nhóm: ${group.name}`,
        req.ip ?? null,
        'Sửa nhóm báo cáo'
      );

      res.json({ success: true, data: group });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// DELETE /api/report-groups/:id — Xóa nhóm báo cáo (admin + canDeleteGroup)
router.delete(
  '/report-groups/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const hasPerm = await checkActionPermission(req, 'canDeleteGroup');
      if (!hasPerm) {
        return res.status(403).json({ success: false, error: 'Bạn không có quyền xóa nhóm báo cáo' });
      }

      const group = await authService.getReportGroupById((req.params as any).id as string);
      if (!group) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy nhóm báo cáo' });
      }

      await authService.deleteReportGroup((req.params as any).id as string);

      await auditService.log(
        'DELETE_REPORT',
        req.user!.userId,
        `Nhóm: ${group.name}`,
        req.ip ?? null,
        null
      );

      res.json({ success: true, message: 'Xóa nhóm báo cáo thành công' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Legacy permission APIs (kept for backward compat) ─────────

// GET /api/users/:id/permissions — Permissions cũ (per-report)
router.get(
  '/users/:id/permissions',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const perms = await reportService.getUserPermissions((req.params as any).id as string);
      res.json({ success: true, data: perms });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/users/:id/permissions — Permissions cũ (per-report)
router.put(
  '/users/:id/permissions',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { permissions } = req.body as {
        permissions: Array<{ reportId: string; canView?: boolean; canExport?: boolean }>;
      };

      if (!Array.isArray(permissions)) {
        return res.status(400).json({ success: false, error: 'Permissions phải là array' });
      }

      for (const perm of permissions) {
        await reportService.setUserReportPermission((req.params as any).id as string, perm.reportId, {
          canView: perm.canView,
          canExport: perm.canExport,
        });
      }

      const user = await authService.findById((req.params as any).id as string);
      await auditService.log(
        'SET_PERMISSION',
        req.user!.userId,
        user?.username ?? null,
        req.ip ?? null,
        `Cập nhật ${permissions.length} quyền báo cáo`
      );

      const updated = await reportService.getUserPermissions((req.params as any).id as string);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/users/bulk-permissions — Bulk assign per-report permissions
router.post(
  '/users/bulk-permissions',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { userIds, reportIds, canView, canExport } = req.body;

      if (!Array.isArray(userIds) || !Array.isArray(reportIds)) {
        return res.status(400).json({ success: false, error: 'userIds và reportIds phải là array' });
      }

      await reportService.bulkSetPermissions(userIds, reportIds, { canView, canExport });

      await auditService.log(
        'SET_PERMISSION',
        req.user!.userId,
        'Bulk assign',
        req.ip ?? null,
        `${userIds.length} users × ${reportIds.length} reports`
      );

      res.json({ success: true, message: 'Gán quyền hàng loạt thành công' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
