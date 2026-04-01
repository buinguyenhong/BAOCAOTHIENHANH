import { Router, Request, Response } from 'express';
import { reportService } from '../services/report.service.js';
import { authService } from '../services/auth.service.js';
import { excelExportService } from '../services/excel-export.js';
import { auditService } from '../services/audit.service.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { checkReportView, checkReportExport } from '../middleware/permission.middleware.js';
import { normalizeQueryParams } from '../utils/normalize.js';
import { serializeReportParams } from '../services/param-serializer.js';

const router = Router();

// Helper: kiểm tra action permission cho current user
async function checkActionPermission(
  req: AuthRequest,
  action: 'canCreateReport' | 'canEditReport' | 'canDeleteReport' | 'canCreateGroup' | 'canEditGroup' | 'canDeleteGroup'
): Promise<boolean> {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const perms = await authService.getUserActionPermissions(userId, role);
  return perms[action];
}

// =====================
// USER ROUTES (/api/user/reports)
// =====================

// GET /api/user/reports - Danh sách báo cáo được phép xem
router.get(
  '/user/reports',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const reports = await reportService.getReportsForUser(req.user!.userId, req.user!.role);
      const safeReports = reports.map(({ parameters, mappings, ...rest }) => ({
        ...rest,
        parameters: parameters || [],
        mappings: mappings || [],
      }));
      res.json({ success: true, data: safeReports });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/user/reports/:id - Chi tiết báo cáo
router.get(
  '/user/reports/:id',
  authMiddleware,
  checkReportView(),
  async (req: AuthRequest, res: Response) => {
    try {
      const report = await reportService.getReportById(((req.params as any).id as string));
      if (!report) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy báo cáo' });
      }
      const { parameters, mappings, ...rest } = report;
      res.json({
        success: true,
        data: { ...rest, parameters: parameters || [], mappings: mappings || [] },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/user/reports/:id/execute - Chạy báo cáo
// Chuẩn hóa query params trước khi map theo report.parameters
router.get(
  '/user/reports/:id/execute',
  authMiddleware,
  checkReportView(),
  async (req: AuthRequest, res: Response) => {
    try {
      const reportId = ((req.params as any).id as string);
      const report = await reportService.getReportById(reportId);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy báo cáo' });
      }

      // Normalize toàn bộ query string: @TuNgay, TuNgay, tungay → TUNGAY
      const normalizedQuery = normalizeQueryParams(req.query as Record<string, unknown>);

      // Serialize params theo cấu hình báo cáo (paramType + valueMode)
      const params: Record<string, string> = serializeReportParams(
        report.parameters || [],
        normalizedQuery
      );

      const result = await reportService.executeReport(reportId, params);

      await auditService.log(
        'RUN_REPORT',
        req.user!.userId,
        `${report.name} (${report.spName})`,
        req.ip ?? null,
        JSON.stringify(params)
      );

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/user/reports/:id/export - Export Excel
router.post(
  '/user/reports/:id/export',
  authMiddleware,
  checkReportExport(),
  async (req: AuthRequest, res: Response) => {
    try {
      const reportId = ((req.params as any).id as string);
      const report = await reportService.getReportById(reportId);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy báo cáo' });
      }

      // ⚠️ Nếu client gửi recordsets → log warning nhưng ignore (backward compat)
      const { recordsets: clientRecordsets, params: clientParams } = req.body as {
        recordsets?: any[][];
        params?: Record<string, unknown>;
      };
      if (clientRecordsets) {
        console.warn(
          `[Export] reportId=${reportId} client sent recordsets payload — ignoring, re-executing SP`
        );
      }

      // Serialize params từ client body theo cấu hình báo cáo
      const rawParams: Record<string, unknown> = clientParams
        ? clientParams
        : normalizeQueryParams(req.query as Record<string, any>);

      // Serialize params theo cấu hình báo cáo (paramType + valueMode)
      const params: Record<string, string> = serializeReportParams(
        report.parameters || [],
        rawParams
      );

      // Backend tự gọi lại SP để lấy dữ liệu thật
      const result = await reportService.executeReport(reportId, params);

      const fileName = `${report.name.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      const buffer = await excelExportService.exportReport(
        report.mappings || [],
        report.templateFile,
        params,
        result.recordsets || [result.rows],
        fileName,
        result.recordsetMetadata
      );

      await auditService.log(
        'EXPORT_REPORT',
        req.user!.userId,
        `${report.name} (${report.spName})`,
        req.ip ?? null,
        `${(result.rows || []).length} rows`
      );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err: any) {
      console.error('Export error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// =====================
// ADMIN ROUTES (/api/reports)
// =====================

// GET /api/reports - Danh sách tất cả báo cáo (admin)
router.get(
  '/reports',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const reports = await reportService.getAllReports();
      const safeReports = reports.map(({ parameters, mappings, permissions, ...rest }) => ({
        ...rest,
        parameters: parameters || [],
        mappings: mappings || [],
      }));
      res.json({ success: true, data: safeReports });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/reports - Tạo báo cáo mới
router.post(
  '/reports',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const hasPerm = await checkActionPermission(req, 'canCreateReport');
      if (!hasPerm) {
        return res.status(403).json({ success: false, error: 'Bạn không có quyền thêm báo cáo' });
      }

      const { name, groupName, groupIcon, spName, description, parameters, mappings, templateFile, templateData, reportGroupId } = req.body;

      if (!name || !spName) {
        return res.status(400).json({ success: false, error: 'Tên báo cáo và Stored Procedure là bắt buộc' });
      }

      const report = await reportService.createReport(
        { name, groupName, groupIcon, spName, description, reportGroupId } as any,
        req.user!.userId
      );

      if (parameters && Array.isArray(parameters)) {
        await reportService.setReportParameters(report.id, parameters);
      }
      if (mappings && Array.isArray(mappings)) {
        await reportService.setReportMappings(report.id, mappings);
      }

      let templateSavedPath: string | undefined;
      if (templateFile && templateData) {
        const buffer = Buffer.from(templateData, 'base64');
        templateSavedPath = reportService.saveTemplate(report.id, buffer, templateFile);
        await reportService.updateReport(report.id, { templateFile: templateSavedPath });
      }

      await auditService.log(
        'CREATE_REPORT',
        req.user!.userId,
        `${name} (${spName})`,
        req.ip ?? null,
        templateSavedPath ? `Template: ${templateSavedPath}` : null
      );

      const updated = await reportService.getReportById(report.id);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      console.error('Create report error:', err);
      res.status(500).json({ success: false, error: err.message || 'Lỗi không xác định' });
    }
  }
);

// GET /api/reports/:id - Chi tiết báo cáo (admin)
router.get(
  '/reports/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const report = await reportService.getReportById(((req.params as any).id as string));
      if (!report) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy báo cáo' });
      }
      res.json({ success: true, data: report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/reports/:id - Cập nhật báo cáo
router.put(
  '/reports/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const hasPerm = await checkActionPermission(req, 'canEditReport');
      if (!hasPerm) {
        return res.status(403).json({ success: false, error: 'Bạn không có quyền sửa báo cáo' });
      }

      const { name, groupName, groupIcon, description, templateFile, parameters, mappings, reportGroupId } = req.body;

      const updated = await reportService.updateReport(((req.params as any).id as string), {
        name,
        groupName,
        groupIcon,
        description,
        templateFile,
        reportGroupId,
      } as any);

      if (parameters !== undefined) {
        await reportService.setReportParameters(((req.params as any).id as string), parameters);
      }
      if (mappings !== undefined) {
        await reportService.setReportMappings(((req.params as any).id as string), mappings);
      }

      await auditService.log(
        'UPDATE_REPORT',
        req.user!.userId,
        `${updated?.name || ((req.params as any).id as string)}`,
        req.ip ?? null,
        null
      );

      const result = await reportService.getReportById(((req.params as any).id as string));
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// DELETE /api/reports/:id - Xóa báo cáo
router.delete(
  '/reports/:id',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const hasPerm = await checkActionPermission(req, 'canDeleteReport');
      if (!hasPerm) {
        return res.status(403).json({ success: false, error: 'Bạn không có quyền xóa báo cáo' });
      }

      const report = await reportService.getReportById(((req.params as any).id as string));
      await reportService.deleteReport(((req.params as any).id as string));

      await auditService.log(
        'DELETE_REPORT',
        req.user!.userId,
        `${report?.name || ((req.params as any).id as string)}`,
        req.ip ?? null,
        null
      );

      res.json({ success: true, message: 'Xóa báo cáo thành công' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/reports/:id/parameters - Cập nhật parameters riêng
router.put(
  '/reports/:id/parameters',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { parameters } = req.body;
      if (!Array.isArray(parameters)) {
        return res.status(400).json({ success: false, error: 'Parameters phải là array' });
      }
      await reportService.setReportParameters(((req.params as any).id as string), parameters);
      const updated = await reportService.getReportParameters(((req.params as any).id as string));
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/reports/:id/mappings - Cập nhật mappings riêng
router.put(
  '/reports/:id/mappings',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { mappings } = req.body;
      if (!Array.isArray(mappings)) {
        return res.status(400).json({ success: false, error: 'Mappings phải là array' });
      }
      await reportService.setReportMappings(((req.params as any).id as string), mappings);
      const updated = await reportService.getReportMappings(((req.params as any).id as string));
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/reports/:id/template/sheets - Lấy danh sách sheet từ template
router.get(
  '/reports/:id/template/sheets',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const report = await reportService.getReportById((req.params as any).id as string);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy báo cáo' });
      }
      if (!report.templateFile) {
        return res.json({ success: true, data: [] });
      }
      const sheets = await reportService.getTemplateSheets(report.templateFile);
      res.json({ success: true, data: sheets });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// PUT /api/reports/:id/template - Upload template file
router.put(
  '/reports/:id/template',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fileName, fileData } = req.body as { fileName: string; fileData: string };

      if (!fileName || !fileData) {
        return res.status(400).json({ success: false, error: 'Thiếu file' });
      }

      const reportId = (req.params as any).id as string;
      const buffer = Buffer.from(fileData, 'base64');
      const savedPath = reportService.saveTemplate(reportId, buffer, fileName);

      await reportService.updateReport(reportId, {
        templateFile: savedPath,
      });

      res.json({ success: true, message: 'Template đã được lưu', data: { fileName, path: savedPath } });
    } catch (err: any) {
      console.error('Upload template error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/reports/:id/parameters/options — Lấy options động cho param có optionsSourceType='sql'
router.get(
  '/reports/:id/parameters/options',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const reportId = (req.params as any).id as string;
      const { paramId } = req.query as { paramId?: string };

      if (!paramId) {
        return res.status(400).json({ success: false, error: 'Thiếu paramId' });
      }

      const params = await reportService.getReportParameters(reportId);
      const param = params.find(p => p.id === paramId);

      if (!param) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy tham số' });
      }

      if (param.optionsSourceType !== 'sql' || !param.optionsQuery) {
        return res.json({ success: true, data: [] });
      }

      // Execute options query trên HospitalDB
      try {
        const { hospitalDb } = await import('../config/database.js');
        const result = await hospitalDb(param.optionsQuery);
        // Giả sử query trả về { value: string, label: string } hoặc chỉ 2 cột
        const options = (result.recordset || []).map((row: any, idx: number) => {
          if (row.value !== undefined && row.label !== undefined) {
            return { value: String(row.value), label: String(row.label) };
          }
          const keys = Object.keys(row);
          if (keys.length >= 2) {
            return { value: String(row[keys[0]]), label: String(row[keys[1]]) };
          }
          return { value: String(idx), label: String(row[keys[0]]) };
        });
        res.json({ success: true, data: options });
      } catch (dbErr: any) {
        console.error('Options query error:', dbErr);
        res.status(500).json({ success: false, error: `Lỗi truy vấn options: ${dbErr.message}` });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
