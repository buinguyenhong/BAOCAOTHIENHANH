import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { auditService } from '../services/audit.service.js';
import { generateToken } from '../utils/jwt.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      await auditService.log('LOGIN_FAILED', null, username, req.ip ?? null, 'Thiếu username hoặc password');
      return res.status(400).json({
        success: false,
        error: 'Vui lòng nhập username và password',
      });
    }

    const user = await authService.login({ username, password });

    if (!user) {
      await auditService.log('LOGIN_FAILED', null, username, req.ip ?? null, 'Sai username hoặc password');
      return res.status(401).json({
        success: false,
        error: 'Username hoặc password không đúng',
      });
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    await auditService.log('LOGIN', user.id, user.username, req.ip ?? null, 'Đăng nhập thành công');

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
        },
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Lỗi server' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (req.user) {
    await auditService.log('LOGOUT', req.user.userId, req.user.username, req.ip ?? null, 'Đăng xuất');
  }
  res.json({ success: true, message: 'Đăng xuất thành công' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await authService.findById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Lỗi server' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập đầy đủ thông tin' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const ok = await authService.changePassword(req.user!.userId, oldPassword, newPassword);
    if (!ok) {
      return res.status(400).json({ success: false, error: 'Mật khẩu cũ không đúng' });
    }

    await auditService.log(
      'UPDATE_USER',
      req.user!.userId,
      `User ${req.user!.username}`,
      req.ip ?? null,
      'Đổi mật khẩu'
    );

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Lỗi server' });
  }
});

export default router;
