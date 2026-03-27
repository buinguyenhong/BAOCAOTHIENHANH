import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware.js';
import { reportService } from '../services/report.service.js';

// Middleware kiểm tra quyền xem báo cáo
export const checkReportView = () => {
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

    try {
      const perm = await reportService.checkPermission(req.user.userId, reportId, req.user.role);
      if (!perm.canView) {
        res.status(403).json({ success: false, error: 'Bạn không có quyền xem báo cáo này' });
        return;
      }
      next();
    } catch (err) {
      res.status(500).json({ success: false, error: 'Lỗi kiểm tra quyền' });
    }
  };
};

// Middleware kiểm tra quyền export báo cáo
export const checkReportExport = () => {
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

    try {
      const perm = await reportService.checkPermission(req.user.userId, reportId, req.user.role);
      if (!perm.canExport) {
        res.status(403).json({ success: false, error: 'Bạn không có quyền xuất báo cáo này' });
        return;
      }
      next();
    } catch (err) {
      res.status(500).json({ success: false, error: 'Lỗi kiểm tra quyền' });
    }
  };
};
