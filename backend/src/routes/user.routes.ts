import { Router, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { reportService } from '../services/report.service.js';
import { auditService } from '../services/audit.service.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

const router = Router();

// GET /api/users - Danh sách users (admin)
router.get(
  '/users',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const users = await authService.getAllUsers();
      res.json({ success: true, data: users });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/users - Tạo user mới (admin)
router.post(
  '/users',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { username, password, fullName, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username và password là bắt buộc' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password phải có ít nhất 6 ký tự' });
      }

      // Check existing
      const existing = await authService.findByUsername(username);
      if (existing) {
        return res.status(400).json({ success: false, error: 'Username đã tồn tại' });
      }

      const user = await authService.createUser({ username, password, fullName, role });

      await auditService.log(
        'CREATE_USER',
        req.user!.userId,
        username,
        req.ip,
        `Tạo user ${username} với role ${role || 'user'}`
      );

      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (err: any) {
      console.error('Create user error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/users/:id - Cập nhật user (admin)
router.put(
  '/users/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fullName, role, isActive } = req.body;

      // Không cho phép tự sửa role của chính mình thành non-admin
      if (req.params.id === req.user!.userId && role && role !== 'admin') {
        return res.status(400).json({ success: false, error: 'Không thể hạ role của chính mình' });
      }

      const updated = await authService.updateUser(req.params.id, { fullName, role, isActive });
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
      }

      await auditService.log(
        'UPDATE_USER',
        req.user!.userId,
        updated.username,
        req.ip,
        `Cập nhật: fullName=${fullName}, role=${role}, isActive=${isActive}`
      );

      res.json({
        success: true,
        data: {
          id: updated.id,
          username: updated.username,
          fullName: updated.fullName,
          role: updated.role,
          isActive: updated.isActive,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/users/:id/reset-password - Reset password (admin)
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

      const user = await authService.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
      }

      await authService.resetPassword(req.params.id, newPassword);

      await auditService.log(
        'UPDATE_USER',
        req.user!.userId,
        user.username,
        req.ip,
        'Reset password'
      );

      res.json({ success: true, message: 'Đặt lại mật khẩu thành công' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// DELETE /api/users/:id - Xóa user (admin)
router.delete(
  '/users/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      if (req.params.id === req.user!.userId) {
        return res.status(400).json({ success: false, error: 'Không thể xóa chính mình' });
      }

      const user = await authService.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
      }

      await authService.deleteUser(req.params.id);

      await auditService.log(
        'DELETE_USER',
        req.user!.userId,
        user.username,
        req.ip,
        null
      );

      res.json({ success: true, message: 'Xóa user thành công' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/users/:id/permissions - Lấy permissions của user
router.get(
  '/users/:id/permissions',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const perms = await reportService.getUserPermissions(req.params.id);
      res.json({ success: true, data: perms });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/users/:id/permissions - Gán quyền báo cáo cho user
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
        await reportService.setUserReportPermission(req.params.id, perm.reportId, {
          canView: perm.canView,
          canExport: perm.canExport,
        });
      }

      const user = await authService.findById(req.params.id);
      await auditService.log(
        'SET_PERMISSION',
        req.user!.userId,
        user?.username,
        req.ip,
        `Cập nhật ${permissions.length} quyền báo cáo`
      );

      const updated = await reportService.getUserPermissions(req.params.id);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/users/bulk-permissions - Bulk assign permissions
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
        req.ip,
        `${userIds.length} users × ${reportIds.length} reports`
      );

      res.json({ success: true, message: 'Gán quyền hàng loạt thành công' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
