import { configDb, configExec } from '../config/database.js';
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
  User,
} from '../models/types.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AuthService {
  async findByUsername(username: string): Promise<User | null> {
    const users = configDb<User>(
      'SELECT * FROM Users WHERE username = $username',
      { username }
    );
    return users[0] || null;
  }

  async findById(id: string): Promise<User | null> {
    const users = configDb<User>(
      'SELECT * FROM Users WHERE id = $id',
      { id }
    );
    return users[0] || null;
  }

  async login(dto: { username: string; password: string }): Promise<User | null> {
    const user = await this.findByUsername(dto.username);
    if (!user) return null;
    if (!user.isActive) return null;

    const isMatch = await comparePassword(dto.password, user.password || '');
    if (!isMatch) return null;

    return user;
  }

  async createUser(dto: { username: string; password: string; fullName?: string; role?: string }): Promise<User> {
    const id = uuidv4();
    const hashed = await hashPassword(dto.password);

    configExec(
      `INSERT INTO Users (id, username, password, fullName, role, isActive)
       VALUES ($id, $username, $password, $fullName, $role, 1)`,
      {
        id,
        username: dto.username,
        password: hashed,
        fullName: dto.fullName || null,
        role: dto.role || 'user',
      }
    );

    return this.findById(id) as Promise<User>;
  }

  async updateUser(id: string, dto: { fullName?: string; role?: string; isActive?: boolean }): Promise<User | null> {
    const updates: string[] = [];
    const params: Record<string, any> = { id };

    if (dto.fullName !== undefined) { updates.push('fullName = $fullName'); params.fullName = dto.fullName; }
    if (dto.role !== undefined) { updates.push('role = $role'); params.role = dto.role; }
    if (dto.isActive !== undefined) { updates.push('isActive = $isActive'); params.isActive = dto.isActive ? 1 : 0; }

    if (updates.length === 0) return this.findById(id);

    updates.push("updatedAt = datetime('now')");

    configExec(
      `UPDATE Users SET ${updates.join(', ')} WHERE id = $id`,
      params
    );

    return this.findById(id);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    const isMatch = await comparePassword(oldPassword, user.password || '');
    if (!isMatch) return false;

    const hashed = await hashPassword(newPassword);
    configExec(
      `UPDATE Users SET password = $password, updatedAt = datetime('now') WHERE id = $id`,
      { id: userId, password: hashed }
    );

    return true;
  }

  async resetPassword(userId: string, newPassword: string): Promise<boolean> {
    const hashed = await hashPassword(newPassword);
    configExec(
      `UPDATE Users SET password = $password, updatedAt = datetime('now') WHERE id = $id`,
      { id: userId, password: hashed }
    );
    return true;
  }

  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    return configDb<Omit<User, 'password'>>(
      'SELECT id, username, fullName, role, isActive, createdAt, updatedAt FROM Users ORDER BY createdAt DESC'
    );
  }

  async deleteUser(id: string): Promise<boolean> {
    configExec('DELETE FROM Users WHERE id = $id', { id });
    return true;
  }
}

export const authService = new AuthService();

// =====================
// Report CRUD
// =====================
export class ReportService {
  async getAllReports(): Promise<Report[]> {
    const reports = configDb<Report>('SELECT * FROM Reports ORDER BY groupName, name');
    for (const report of reports) {
      (report as any).parameters = await this.getReportParameters(report.id);
      (report as any).mappings = await this.getReportMappings(report.id);
    }
    return reports;
  }

  async getReportById(id: string): Promise<Report | null> {
    const reports = configDb<Report>(
      'SELECT * FROM Reports WHERE id = $id',
      { id }
    );
    if (reports.length === 0) return null;

    const report = reports[0];
    (report as any).parameters = await this.getReportParameters(report.id);
    (report as any).mappings = await this.getReportMappings(report.id);
    return report;
  }

  async getReportsForUser(userId: string, role: string): Promise<Report[]> {
    let reports: Report[];
    if (role === 'admin') {
      reports = configDb<Report>('SELECT * FROM Reports ORDER BY groupName, name');
    } else {
      reports = configDb<Report>(
        `SELECT DISTINCT r.* FROM Reports r
         INNER JOIN ReportPermissions rp ON r.id = rp.reportId
         WHERE rp.userId = $userId AND rp.canView = 1
         ORDER BY r.groupName, r.name`,
        { userId }
      );
    }
    for (const report of reports) {
      (report as any).parameters = await this.getReportParameters(report.id);
      (report as any).mappings = await this.getReportMappings(report.id);
    }
    return reports;
  }

  async checkPermission(userId: string, reportId: string, role: string): Promise<{
    canView: boolean;
    canExport: boolean;
  }> {
    if (role === 'admin') return { canView: true, canExport: true };

    const perms = configDb<{ canView: number; canExport: number }>(
      'SELECT canView, canExport FROM ReportPermissions WHERE userId = $userId AND reportId = $reportId',
      { userId, reportId }
    );
    if (perms.length === 0) return { canView: false, canExport: false };
    return { canView: !!perms[0].canView, canExport: !!perms[0].canExport };
  }

  async createReport(dto: CreateReportDto, createdBy: string): Promise<Report> {
    const id = uuidv4();
    configExec(
      `INSERT INTO Reports (id, name, groupName, groupIcon, spName, description, templateFile, createdBy)
       VALUES ($id, $name, $groupName, $groupIcon, $spName, $description, $templateFile, $createdBy)`,
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

  async updateReport(id: string, dto: UpdateReportDto): Promise<Report | null> {
    const updates: string[] = [];
    const params: Record<string, any> = { id };

    if (dto.name !== undefined) { updates.push('name = $name'); params.name = dto.name; }
    if (dto.groupName !== undefined) { updates.push('groupName = $groupName'); params.groupName = dto.groupName; }
    if (dto.groupIcon !== undefined) { updates.push('groupIcon = $groupIcon'); params.groupIcon = dto.groupIcon; }
    if (dto.description !== undefined) { updates.push('description = $description'); params.description = dto.description; }
    if (dto.templateFile !== undefined) { updates.push('templateFile = $templateFile'); params.templateFile = dto.templateFile; }
    if (dto.spName !== undefined) { updates.push('spName = $spName'); params.spName = dto.spName; }

    if (updates.length === 0) return this.getReportById(id);
    updates.push("updatedAt = datetime('now')");

    configExec(
      `UPDATE Reports SET ${updates.join(', ')} WHERE id = $id`,
      params
    );
    return this.getReportById(id);
  }

  async deleteReport(id: string): Promise<boolean> {
    configExec('DELETE FROM Reports WHERE id = $id', { id });
    return true;
  }

  async executeReport(reportId: string, params: Record<string, any>): Promise<QueryResult> {
    const report = await this.getReportById(reportId);
    if (!report) throw new Error('Báo cáo không tồn tại');
    return hospitalService.executeStoredProcedure(report.spName, params);
  }

  // Parameters
  async getReportParameters(reportId: string): Promise<ReportParameter[]> {
    const params = configDb<any>(
      'SELECT * FROM ReportParameters WHERE reportId = $reportId ORDER BY displayOrder',
      { reportId }
    );
    return params.map(p => ({
      ...p,
      isRequired: !!p.isRequired,
      options: p.options ? JSON.parse(p.options) : null,
    }));
  }

  async setReportParameters(reportId: string, params: CreateReportParamDto[]): Promise<void> {
    configExec('DELETE FROM ReportParameters WHERE reportId = $reportId', { reportId });
    for (const p of params) {
      configExec(
        `INSERT INTO ReportParameters (id, reportId, paramName, paramLabel, paramType, defaultValue, isRequired, displayOrder, options)
         VALUES ($id, $reportId, $paramName, $paramLabel, $paramType, $defaultValue, $isRequired, $displayOrder, $options)`,
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

  // Mappings
  async getReportMappings(reportId: string): Promise<ReportMapping[]> {
    return configDb<ReportMapping>(
      'SELECT * FROM ReportMappings WHERE reportId = $reportId ORDER BY displayOrder',
      { reportId }
    );
  }

  async setReportMappings(reportId: string, mappings: CreateReportMappingDto[]): Promise<void> {
    configExec('DELETE FROM ReportMappings WHERE reportId = $reportId', { reportId });
    for (const m of mappings) {
      configExec(
        `INSERT INTO ReportMappings (id, reportId, fieldName, cellAddress, mappingType, displayOrder, sheetName, recordsetIndex)
         VALUES ($id, $reportId, $fieldName, $cellAddress, $mappingType, $displayOrder, $sheetName, $recordsetIndex)`,
        {
          id: uuidv4(),
          reportId,
          fieldName: m.fieldName,
          cellAddress: m.cellAddress || null,
          mappingType: m.mappingType || 'list',
          displayOrder: m.displayOrder || 0,
          sheetName: m.sheetName || null,
          recordsetIndex: m.recordsetIndex ?? 0,
        }
      );
    }
  }

  // Permissions
  async getReportPermissions(reportId: string): Promise<ReportPermission[]> {
    return configDb<ReportPermission>(
      'SELECT * FROM ReportPermissions WHERE reportId = $reportId',
      { reportId }
    );
  }

  async getUserPermissions(userId: string): Promise<ReportPermission[]> {
    return configDb<ReportPermission>(
      'SELECT * FROM ReportPermissions WHERE userId = $userId',
      { userId }
    );
  }

  async setUserReportPermission(
    userId: string,
    reportId: string,
    dto: SetPermissionDto
  ): Promise<void> {
    const existing = configDb<{ id: string }>(
      'SELECT id FROM ReportPermissions WHERE userId = $userId AND reportId = $reportId',
      { userId, reportId }
    );

    if (existing.length > 0) {
      configExec(
        `UPDATE ReportPermissions SET canView = $canView, canExport = $canExport WHERE id = $id`,
        {
          id: existing[0].id,
          canView: dto.canView !== undefined ? (dto.canView ? 1 : 0) : 1,
          canExport: dto.canExport !== undefined ? (dto.canExport ? 1 : 0) : 1,
        }
      );
    } else {
      configExec(
        `INSERT INTO ReportPermissions (id, reportId, userId, canView, canExport)
         VALUES ($id, $reportId, $userId, $canView, $canExport)`,
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
    configExec(
      'DELETE FROM ReportPermissions WHERE userId = $userId AND reportId = $reportId',
      { userId, reportId }
    );
  }

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

  saveTemplate(reportId: string, fileBuffer: Buffer, fileName: string): string {
    const dir = path.join(__dirname, `../../templates/${reportId}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(dir, safeName);
    fs.writeFileSync(filePath, fileBuffer);
    // Trả về relative path để lưu vào DB
    return `${reportId}/${safeName}`;
  }

  getTemplatePath(templateFile: string): string | null {
    // templateFile có dạng "reportId/filename.xlsx"
    const filePath = path.join(__dirname, '../../templates', templateFile);
    return fs.existsSync(filePath) ? filePath : null;
  }

  async getTemplateSheets(templateFile: string): Promise<string[]> {
    if (!templateFile) return [];
    const filePath = this.getTemplatePath(templateFile);
    if (!filePath) return [];
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fs.readFileSync(filePath).buffer as ArrayBuffer);
    return wb.worksheets.map(ws => ws.name);
  }
}

export const reportService = new ReportService();
