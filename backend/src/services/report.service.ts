import { configDb } from '../config/database.js';
import { hospitalService } from './hospital.service.js';
import {
  Report,
  ReportParameter,
  ReportMapping,
  ReportPermission,
  CreateReportDto,
  UpdateReportDto,
  CreateReportParamDto,
  CreateReportMappingDto,
  SetPermissionDto,
  QueryResult,
} from '../models/types.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// =====================
// Report CRUD
// =====================
export class ReportService {
  // Lấy tất cả báo cáo (admin)
  async getAllReports(): Promise<Report[]> {
    const reports = await configDb<Report>(
      'SELECT * FROM Reports ORDER BY groupName, name'
    );

    // Load parameters và mappings
    for (const report of reports) {
      report.parameters = await this.getReportParameters(report.id);
      report.mappings = await this.getReportMappings(report.id);
    }

    return reports;
  }

  // Lấy báo cáo theo ID
  async getReportById(id: string): Promise<Report | null> {
    const reports = await configDb<Report>(
      'SELECT * FROM Reports WHERE id = @id',
      { id }
    );

    if (reports.length === 0) return null;

    const report = reports[0];
    report.parameters = await this.getReportParameters(report.id);
    report.mappings = await this.getReportMappings(report.id);

    return report;
  }

  // Lấy báo cáo được phép xem của user
  async getReportsForUser(userId: string, role: string): Promise<Report[]> {
    let reports: Report[];

    if (role === 'admin') {
      reports = await configDb<Report>('SELECT * FROM Reports ORDER BY groupName, name');
    } else {
      reports = await configDb<Report>(
        `SELECT DISTINCT r.*
         FROM Reports r
         INNER JOIN ReportPermissions rp ON r.id = rp.reportId
         WHERE rp.userId = @userId AND rp.canView = 1
         ORDER BY r.groupName, r.name`,
        { userId }
      );
    }

    // Load parameters
    for (const report of reports) {
      report.parameters = await this.getReportParameters(report.id);
      report.mappings = await this.getReportMappings(report.id);
    }

    return reports;
  }

  // Kiểm tra quyền user trên báo cáo
  async checkPermission(userId: string, reportId: string, role: string): Promise<{
    canView: boolean;
    canExport: boolean;
  }> {
    if (role === 'admin') {
      return { canView: true, canExport: true };
    }

    const perms = await configDb<{ canView: boolean; canExport: boolean }>(
      'SELECT canView, canExport FROM ReportPermissions WHERE userId = @userId AND reportId = @reportId',
      { userId, reportId }
    );

    if (perms.length === 0) return { canView: false, canExport: false };
    return { canView: !!perms[0].canView, canExport: !!perms[0].canExport };
  }

  // Tạo báo cáo mới
  async createReport(dto: CreateReportDto, createdBy: string): Promise<Report> {
    const id = uuidv4();

    await configDb(
      `INSERT INTO Reports (id, name, groupName, groupIcon, spName, description, templateFile, createdBy)
       VALUES (@id, @name, @groupName, @groupIcon, @spName, @description, @templateFile, @createdBy)`,
      {
        id,
        name: dto.name,
        groupName: dto.groupName || 'Tổng hợp',
        groupIcon: dto.groupIcon || '📂',
        spName: dto.spName,
        description: dto.description || null,
        templateFile: dto.templateFile || null,
        createdBy,
      }
    );

    return this.getReportById(id) as Promise<Report>;
  }

  // Cập nhật báo cáo
  async updateReport(id: string, dto: UpdateReportDto): Promise<Report | null> {
    const updates: string[] = [];
    const params: Record<string, any> = { id };

    if (dto.name !== undefined) { updates.push('name = @name'); params.name = dto.name; }
    if (dto.groupName !== undefined) { updates.push('groupName = @groupName'); params.groupName = dto.groupName; }
    if (dto.groupIcon !== undefined) { updates.push('groupIcon = @groupIcon'); params.groupIcon = dto.groupIcon; }
    if (dto.description !== undefined) { updates.push('description = @description'); params.description = dto.description; }
    if (dto.templateFile !== undefined) { updates.push('templateFile = @templateFile'); params.templateFile = dto.templateFile; }
    if (dto.spName !== undefined) { updates.push('spName = @spName'); params.spName = dto.spName; }

    if (updates.length === 0) return this.getReportById(id);

    updates.push('updatedAt = GETDATE()');

    await configDb(
      `UPDATE Reports SET ${updates.join(', ')} WHERE id = @id`,
      params
    );

    return this.getReportById(id);
  }

  // Xóa báo cáo
  async deleteReport(id: string): Promise<boolean> {
    await configDb('DELETE FROM Reports WHERE id = @id', { id });
    return true;
  }

  // Chạy báo cáo (execute SP)
  async executeReport(reportId: string, params: Record<string, any>): Promise<QueryResult> {
    const report = await this.getReportById(reportId);
    if (!report) throw new Error('Báo cáo không tồn tại');

    return hospitalService.executeStoredProcedure(report.spName, params);
  }

  // =====================
  // Parameters
  // =====================
  async getReportParameters(reportId: string): Promise<ReportParameter[]> {
    const params = await configDb<any>(
      'SELECT * FROM ReportParameters WHERE reportId = @reportId ORDER BY displayOrder',
      { reportId }
    );

    return params.map(p => ({
      ...p,
      isRequired: !!p.isRequired,
      options: p.options ? JSON.parse(p.options) : null,
    }));
  }

  async setReportParameters(reportId: string, params: CreateReportParamDto[]): Promise<void> {
    // Xóa params cũ
    await configDb('DELETE FROM ReportParameters WHERE reportId = @reportId', { reportId });

    // Thêm params mới
    for (const p of params) {
      await configDb(
        `INSERT INTO ReportParameters (id, reportId, paramName, paramLabel, paramType, defaultValue, isRequired, displayOrder, options)
         VALUES (@id, @reportId, @paramName, @paramLabel, @paramType, @defaultValue, @isRequired, @displayOrder, @options)`,
        {
          id: uuidv4(),
          reportId,
          paramName: p.paramName,
          paramLabel: p.paramLabel || p.paramName,
          paramType: p.paramType || 'text',
          defaultValue: p.defaultValue || null,
          isRequired: p.isRequired ? 1 : 0,
          displayOrder: p.displayOrder || 0,
          options: p.options ? JSON.stringify(p.options) : null,
        }
      );
    }
  }

  // =====================
  // Mappings
  // =====================
  async getReportMappings(reportId: string): Promise<ReportMapping[]> {
    return configDb<ReportMapping>(
      'SELECT * FROM ReportMappings WHERE reportId = @reportId ORDER BY displayOrder',
      { reportId }
    );
  }

  async setReportMappings(reportId: string, mappings: CreateReportMappingDto[]): Promise<void> {
    // Xóa mappings cũ
    await configDb('DELETE FROM ReportMappings WHERE reportId = @reportId', { reportId });

    // Thêm mappings mới
    for (const m of mappings) {
      await configDb(
        `INSERT INTO ReportMappings (id, reportId, fieldName, cellAddress, mappingType, displayOrder)
         VALUES (@id, @reportId, @fieldName, @cellAddress, @mappingType, @displayOrder)`,
        {
          id: uuidv4(),
          reportId,
          fieldName: m.fieldName,
          cellAddress: m.cellAddress || null,
          mappingType: m.mappingType || 'list',
          displayOrder: m.displayOrder || 0,
        }
      );
    }
  }

  // =====================
  // Permissions
  // =====================
  async getReportPermissions(reportId: string): Promise<ReportPermission[]> {
    return configDb<ReportPermission>(
      'SELECT * FROM ReportPermissions WHERE reportId = @reportId',
      { reportId }
    );
  }

  async getUserPermissions(userId: string): Promise<ReportPermission[]> {
    return configDb<ReportPermission>(
      'SELECT * FROM ReportPermissions WHERE userId = @userId',
      { userId }
    );
  }

  async setUserReportPermission(
    userId: string,
    reportId: string,
    dto: SetPermissionDto
  ): Promise<void> {
    const existing = await configDb<{ id: string }>(
      'SELECT id FROM ReportPermissions WHERE userId = @userId AND reportId = @reportId',
      { userId, reportId }
    );

    if (existing.length > 0) {
      await configDb(
        `UPDATE ReportPermissions SET canView = @canView, canExport = @canExport WHERE id = @id`,
        {
          id: existing[0].id,
          canView: dto.canView !== undefined ? (dto.canView ? 1 : 0) : 1,
          canExport: dto.canExport !== undefined ? (dto.canExport ? 1 : 0) : 1,
        }
      );
    } else {
      await configDb(
        `INSERT INTO ReportPermissions (id, reportId, userId, canView, canExport)
         VALUES (@id, @reportId, @userId, @canView, @canExport)`,
        {
          id: uuidv4(),
          reportId,
          userId,
          canView: dto.canView !== undefined ? (dto.canView ? 1 : 0) : 1,
          canExport: dto.canExport !== undefined ? (dto.canExport ? 1 : 0) : 1,
        }
      );
    }
  }

  async removeUserReportPermission(userId: string, reportId: string): Promise<void> {
    await configDb(
      'DELETE FROM ReportPermissions WHERE userId = @userId AND reportId = @reportId',
      { userId, reportId }
    );
  }

  // Bulk set permissions
  async bulkSetPermissions(
    userIds: string[],
    reportIds: string[],
    dto: SetPermissionDto
  ): Promise<void> {
    for (const userId of userIds) {
      for (const reportId of reportIds) {
        await this.setUserReportPermission(userId, reportId, dto);
      }
    }
  }

  // =====================
  // Template file management
  // =====================
  saveTemplate(fileBuffer: Buffer, fileName: string): string {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(TEMPLATES_DIR, safeName);
    fs.writeFileSync(filePath, fileBuffer);

    return filePath;
  }

  getTemplatePath(fileName: string): string | null {
    const filePath = path.join(TEMPLATES_DIR, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    return null;
  }
}

export const reportService = new ReportService();
