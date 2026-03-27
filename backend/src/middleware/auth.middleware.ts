import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractToken } from '../utils/jwt.js';
import { AuthPayload } from '../models/types.js';

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Không có token xác thực',
    });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'Token không hợp lệ hoặc đã hết hạn',
    });
  }
};

// Middleware kiểm tra role admin
export const adminMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Chưa đăng nhập' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Bạn không có quyền thực hiện thao tác này',
    });
    return;
  }

  next();
};
