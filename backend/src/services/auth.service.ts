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
  UserPermission,
  SetUserPermissionsDto,
  ReportGroup,
  CreateReportGroupDto,
  UpdateReportGroupDto,
  SetUserReportGroupsDto,
  UserWithPermissions,
  UserActionPermissions,
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

  async createUser(dto: {
    username: string;
    password: string;
    fullName?: string;
    role?: string;
  }): Promise<User> {
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

    // Tạo UserPermissions mặc định (user thường: toàn quyền false)
    configExec(
      `INSERT INTO UserPermissions (id, userId, canCreateReport, canEditReport, canDeleteReport, canCreateGroup, canEditGroup, canDeleteGroup)
       VALUES ($id, $userId, 0, 0, 0, 0, 0, 0)`,
      { id: uuidv4(), userId: id }
    );

    return this.findById(id) as Promise<User>;
  }

  async updateUser(
    id: string,
    dto: { fullName?: string; role?: string; isActive?: boolean; password?: string }
  ): Promise<User | null> {
    const updates: string[] = [];
    const params: Record<string, any> = { id };

    if (dto.fullName !== undefined) { updates.push('fullName = $fullName'); params.fullName = dto.fullName; }
    if (dto.role !== undefined) { updates.push('role = $role'); params.role = dto.role; }
    if (dto.isActive !== undefined) { updates.push('isActive = $isActive'); params.isActive = dto.isActive ? 1 : 0; }
    if (dto.password !== undefined && dto.password) {
      const hashed = await hashPassword(dto.password);
      updates.push('password = $password');
      params.password = hashed;
    }

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

  // ─── UserPermissions ─────────────────────────────────────────

  async getUserPermissions(userId: string): Promise<UserPermission | null> {
    const rows = configDb<UserPermission & { id: string }>(
      'SELECT * FROM UserPermissions WHERE userId = $userId',
      { userId }
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.userId,
      canCreateReport: !!r.canCreateReport,
      canEditReport: !!r.canEditReport,
      canDeleteReport: !!r.canDeleteReport,
      canCreateGroup: !!r.canCreateGroup,
      canEditGroup: !!r.canEditGroup,
      canDeleteGroup: !!r.canDeleteGroup,
    };
  }

  async setUserPermissions(userId: string, dto: SetUserPermissionsDto): Promise<UserPermission> {
    // Upsert
    const existing = configDb<{ id: string }>(
      'SELECT id FROM UserPermissions WHERE userId = $userId',
      { userId }
    );
    if (existing.length > 0) {
      const updates: string[] = [];
      const params: Record<string, any> = { id: existing[0].id };
      if (dto.canCreateReport !== undefined) { updates.push('canCreateReport = $canCreateReport'); params.canCreateReport = dto.canCreateReport ? 1 : 0; }
      if (dto.canEditReport !== undefined) { updates.push('canEditReport = $canEditReport'); params.canEditReport = dto.canEditReport ? 1 : 0; }
      if (dto.canDeleteReport !== undefined) { updates.push('canDeleteReport = $canDeleteReport'); params.canDeleteReport = dto.canDeleteReport ? 1 : 0; }
      if (dto.canCreateGroup !== undefined) { updates.push('canCreateGroup = $canCreateGroup'); params.canCreateGroup = dto.canCreateGroup ? 1 : 0; }
      if (dto.canEditGroup !== undefined) { updates.push('canEditGroup = $canEditGroup'); params.canEditGroup = dto.canEditGroup ? 1 : 0; }
      if (dto.canDeleteGroup !== undefined) { updates.push('canDeleteGroup = $canDeleteGroup'); params.canDeleteGroup = dto.canDeleteGroup ? 1 : 0; }
      if (updates.length > 0) {
        configExec(`UPDATE UserPermissions SET ${updates.join(', ')} WHERE id = $id`, params);
      }
    } else {
      configExec(
        `INSERT INTO UserPermissions (id, userId, canCreateReport, canEditReport, canDeleteReport, canCreateGroup, canEditGroup, canDeleteGroup)
         VALUES ($id, $userId, $canCreateReport, $canEditReport, $canDeleteReport, $canCreateGroup, $canEditGroup, $canDeleteGroup)`,
        {
          id: uuidv4(),
          userId,
          canCreateReport: dto.canCreateReport ? 1 : 0,
          canEditReport: dto.canEditReport ? 1 : 0,
          canDeleteReport: dto.canDeleteReport ? 1 : 0,
          canCreateGroup: dto.canCreateGroup ? 1 : 0,
          canEditGroup: dto.canEditGroup ? 1 : 0,
          canDeleteGroup: dto.canDeleteGroup ? 1 : 0,
        }
      );
    }
    return this.getUserPermissions(userId) as Promise<UserPermission>;
  }

  /**
   * Lấy quyền hành động của user.
   * Admin luôn có full quyền.
   */
  async getUserActionPermissions(userId: string, role: string): Promise<UserActionPermissions> {
    if (role === 'admin') {
      return {
        canCreateReport: true,
        canEditReport: true,
        canDeleteReport: true,
        canCreateGroup: true,
        canEditGroup: true,
        canDeleteGroup: true,
      };
    }
    const perms = await this.getUserPermissions(userId);
    if (!perms) {
      return {
        canCreateReport: false,
        canEditReport: false,
        canDeleteReport: false,
        canCreateGroup: false,
        canEditGroup: false,
        canDeleteGroup: false,
      };
    }
    return {
      canCreateReport: perms.canCreateReport,
      canEditReport: perms.canEditReport,
      canDeleteReport: perms.canDeleteReport,
      canCreateGroup: perms.canCreateGroup,
      canEditGroup: perms.canEditGroup,
      canDeleteGroup: perms.canDeleteGroup,
    };
  }

  // ─── ReportGroup ─────────────────────────────────────────────

  async getAllReportGroups(): Promise<ReportGroup[]> {
    return configDb<ReportGroup>(
      'SELECT id, name, icon, displayOrder, createdAt FROM ReportGroups ORDER BY displayOrder, name'
    );
  }

  async getReportGroupById(id: string): Promise<ReportGroup | null> {
    const rows = configDb<ReportGroup>(
      'SELECT id, name, icon, displayOrder, createdAt FROM ReportGroups WHERE id = $id',
      { id }
    );
    return rows[0] || null;
  }

  async createReportGroup(dto: CreateReportGroupDto): Promise<ReportGroup> {
    const id = uuidv4();
    configExec(
      `INSERT INTO ReportGroups (id, name, icon, displayOrder)
       VALUES ($id, $name, $icon, $displayOrder)`,
      {
        id,
        name: dto.name,
        icon: dto.icon || '📂',
        displayOrder: dto.displayOrder ?? 0,
      }
    );
    return this.getReportGroupById(id) as Promise<ReportGroup>;
  }

  async updateReportGroup(id: string, dto: UpdateReportGroupDto): Promise<ReportGroup | null> {
    const updates: string[] = [];
    const params: Record<string, any> = { id };
    if (dto.name !== undefined) { updates.push('name = $name'); params.name = dto.name; }
    if (dto.icon !== undefined) { updates.push('icon = $icon'); params.icon = dto.icon; }
    if (dto.displayOrder !== undefined) { updates.push('displayOrder = $displayOrder'); params.displayOrder = dto.displayOrder; }
    if (updates.length === 0) return this.getReportGroupById(id);
    configExec(`UPDATE ReportGroups SET ${updates.join(', ')} WHERE id = $id`, params);
    return this.getReportGroupById(id);
  }

  async deleteReportGroup(id: string): Promise<boolean> {
    // Cập nhật Reports thuộc nhóm này về null
    configExec('UPDATE Reports SET reportGroupId = NULL WHERE reportGroupId = $id', { id });
    configExec('DELETE FROM UserReportGroupPermissions WHERE reportGroupId = $id', { id });
    configExec('DELETE FROM ReportGroups WHERE id = $id', { id });
    return true;
  }

  // ─── UserReportGroupPermission ───────────────────────────────

  /**
   * Lấy danh sách reportGroupId mà user được phép xem.
   */
  async getUserReportGroupIds(userId: string): Promise<string[]> {
    const rows = configDb<{ reportGroupId: string }>(
      'SELECT reportGroupId FROM UserReportGroupPermissions WHERE userId = $userId',
      { userId }
    );
    return rows.map(r => r.reportGroupId);
  }

  /**
   * Gán/replace danh sách nhóm báo cáo cho user.
   */
  async setUserReportGroups(userId: string, dto: SetUserReportGroupsDto): Promise<string[]> {
    configExec('DELETE FROM UserReportGroupPermissions WHERE userId = $userId', { userId });
    for (const groupId of dto.reportGroupIds) {
      configExec(
        `INSERT INTO UserReportGroupPermissions (id, userId, reportGroupId)
         VALUES ($id, $userId, $reportGroupId)`,
        { id: uuidv4(), userId, reportGroupId: groupId }
      );
    }
    return this.getUserReportGroupIds(userId);
  }

  // ─── Full user with all permissions ────────────────────────

  async getUserWithPermissions(userId: string): Promise<UserWithPermissions | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    const permissions = await this.getUserPermissions(userId);
    const reportGroupIds = await this.getUserReportGroupIds(userId);
    const { password: _, ...safeUser } = user;
    return { user: safeUser, permissions, reportGroupIds };
  }

  async getAllUsersWithPermissions(): Promise<UserWithPermissions[]> {
    const users = await this.getAllUsers();
    const results: UserWithPermissions[] = [];
    for (const user of users) {
      const permissions = await this.getUserPermissions(user.id);
      const reportGroupIds = await this.getUserReportGroupIds(user.id);
      results.push({ user, permissions, reportGroupIds });
    }
    return results;
  }

  /**
   * Tạo user đầy đủ (user + permissions + report groups).
   */
  async createUserFull(
    dto: {
      username: string;
      password: string;
      fullName?: string;
      role?: string;
    },
    permissionsDto: SetUserPermissionsDto,
    reportGroupIds: string[]
  ): Promise<UserWithPermissions> {
    const user = await this.createUser(dto);
    await this.setUserPermissions(user.id, permissionsDto);
    await this.setUserReportGroups(user.id, { reportGroupIds });
    return this.getUserWithPermissions(user.id) as Promise<UserWithPermissions>;
  }

  /**
   * Cập nhật user đầy đủ.
   *
   * FIX: Chỉ cập nhật nhóm báo cáo khi reportGroupIds !== undefined.
   * Khi user chỉ cập nhật thông tin cá nhân (không gửi reportGroupIds),
   * nhóm báo cáo hiện tại được giữ nguyên.
   */
  async updateUserFull(
    userId: string,
    userDto: { fullName?: string; role?: string; isActive?: boolean; password?: string },
    permissionsDto: SetUserPermissionsDto | null,
    reportGroupIds: string[] | undefined
  ): Promise<UserWithPermissions | null> {
    const user = await this.updateUser(userId, userDto);
    if (!user) return null;
    if (permissionsDto !== null) {
      await this.setUserPermissions(userId, permissionsDto);
    }
    // Chỉ cập nhật nhóm khi được truyền (không phải undefined)
    if (reportGroupIds !== undefined) {
      await this.setUserReportGroups(userId, { reportGroupIds });
    }
    return this.getUserWithPermissions(userId);
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

  /**
   * Lấy danh sách báo cáo cho user.
   * - Admin: thấy tất cả báo cáo
   * - User thường: chỉ thấy báo cáo thuộc nhóm được cấp quyền xem
   */
  async getReportsForUser(userId: string, role: string): Promise<Report[]> {
    let reports: Report[];
    if (role === 'admin') {
      reports = configDb<Report>('SELECT * FROM Reports ORDER BY groupName, name');
    } else {
      // Tier 1: explicit per-report permission (canView = 1)
      // Tier 2: user belongs to the report's group (also handles NULL reportGroupId
      //           → if user has ANY group permission, show those reports too)
      reports = configDb<Report>(
        `SELECT DISTINCT r.* FROM Reports r
         WHERE (
           EXISTS (
             SELECT 1 FROM ReportPermissions rp
             WHERE rp.reportId = r.id
               AND rp.userId = $userId
               AND rp.canView = 1
           )
           OR (
             r.reportGroupId IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM UserReportGroupPermissions urgp
               WHERE urgp.reportGroupId = r.reportGroupId
                 AND urgp.userId = $userId
             )
           )
           OR (
             r.reportGroupId IS NULL
             AND EXISTS (
               SELECT 1 FROM UserReportGroupPermissions urgp2
               WHERE urgp2.userId = $userId
             )
           )
         )
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
    canView: boolean | undefined;
    canExport: boolean | undefined;
  }> {
    if (role === 'admin') return { canView: true, canExport: true };

    const perms = configDb<{ canView: number; canExport: number }>(
      'SELECT canView, canExport FROM ReportPermissions WHERE userId = $userId AND reportId = $reportId',
      { userId, reportId }
    );
    // Trả undefined khi không có record → middleware sẽ kiểm tra Tier 2 (UserReportGroupPermissions)
    if (perms.length === 0) return { canView: undefined, canExport: undefined };
    return { canView: !!perms[0].canView, canExport: !!perms[0].canExport };
  }

  async createReport(dto: CreateReportDto, createdBy: string): Promise<Report> {
    const id = uuidv4();

    // Resolve group info from reportGroupId if provided
    let groupName = dto.groupName || 'Tổng hợp';
    let groupIcon = dto.groupIcon || '📂';
    if (dto.reportGroupId) {
      const group = authService.getReportGroupById(dto.reportGroupId) as any;
      if (group) {
        groupName = group.name;
        groupIcon = group.icon;
      }
    }

    configExec(
      `INSERT INTO Reports (id, name, groupName, groupIcon, spName, description, templateFile, reportGroupId, createdBy)
       VALUES ($id, $name, $groupName, $groupIcon, $spName, $description, $templateFile, $reportGroupId, $createdBy)`,
      {
        id,
        name: dto.name,
        groupName,
        groupIcon,
        spName: dto.spName,
        description: dto.description || null,
        templateFile: dto.templateFile || null,
        reportGroupId: dto.reportGroupId || null,
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
    if ((dto as any).reportGroupId !== undefined) { updates.push('reportGroupId = $reportGroupId'); params.reportGroupId = (dto as any).reportGroupId; }

    if (updates.length === 0) return this.getReportById(id);
    updates.push("updatedAt = datetime('now')");

    configExec(
      `UPDATE Reports SET ${updates.join(', ')} WHERE id = $id`,
      params
    );
    return this.getReportById(id);
  }

  async deleteReport(id: string): Promise<boolean> {
    // FIX: Xóa template file trong templates/{reportId}/ trước khi xóa report.
    // Nếu không xóa → file rác tích tụ trong thư mục templates.
    // Xóa cả thư mục reportId vì chỉ report này dùng nó.
    const report = configDb<{ templateFile: string | null }>(
      'SELECT templateFile FROM Reports WHERE id = $id',
      { id }
    );
    if (report.length > 0 && report[0].templateFile) {
      try {
        const templateDir = path.join(__dirname, '../../templates', id);
        if (fs.existsSync(templateDir)) {
          fs.rmSync(templateDir, { recursive: true, force: true });
          console.log(`[ReportService] Deleted template dir: ${templateDir}`);
        }
      } catch (err) {
        console.warn(`[ReportService] Failed to delete template dir for report ${id}:`, err);
      }
    }

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
    const rows = configDb<any>(
      'SELECT * FROM ReportParameters WHERE reportId = $reportId ORDER BY displayOrder',
      { reportId }
    );
    return rows.map(p => ({
      id: p.id,
      reportId: p.reportId,
      paramName: p.paramName,
      paramLabel: p.paramLabel ?? p.paramName,
      // SQL metadata
      sqlType: p.sqlType ?? null,
      maxLength: p.maxLength ?? null,
      precision: p.precision ?? null,
      scale: p.scale ?? null,
      isNullable: !!p.isNullable,
      hasDefaultValue: !!p.hasDefaultValue,
      // Business config
      paramType: (p.paramType as any) ?? 'text',
      valueMode: (p.valueMode as any) ?? 'single',
      optionsSourceType: (p.optionsSourceType as any) ?? 'none',
      options: p.options ? JSON.parse(p.options) : null,
      optionsQuery: p.optionsQuery ?? null,
      placeholder: p.placeholder ?? null,
      defaultValue: p.defaultValue ?? null,
      isRequired: !!p.isRequired,
      displayOrder: p.displayOrder ?? 0,
    }));
  }

  async setReportParameters(reportId: string, params: CreateReportParamDto[]): Promise<void> {
    configExec('DELETE FROM ReportParameters WHERE reportId = $reportId', { reportId });
    for (const p of params) {
      configExec(
        `INSERT INTO ReportParameters (
          id, reportId, paramName, paramLabel,
          sqlType, maxLength, precision, scale, isNullable, hasDefaultValue,
          paramType, valueMode, optionsSourceType, options, optionsQuery, placeholder,
          defaultValue, isRequired, displayOrder
        ) VALUES (
          $id, $reportId, $paramName, $paramLabel,
          $sqlType, $maxLength, $precision, $scale, $isNullable, $hasDefaultValue,
          $paramType, $valueMode, $optionsSourceType, $options, $optionsQuery, $placeholder,
          $defaultValue, $isRequired, $displayOrder
        )`,
        {
          id: uuidv4(),
          reportId,
          paramName: p.paramName,
          paramLabel: p.paramLabel || p.paramName || p.paramName,
          // SQL metadata
          sqlType: p.sqlType ?? null,
          maxLength: p.maxLength ?? null,
          precision: p.precision ?? null,
          scale: p.scale ?? null,
          isNullable: p.isNullable !== undefined ? (p.isNullable ? 1 : 0) : 1,
          hasDefaultValue: p.hasDefaultValue ? 1 : 0,
          // Business config
          paramType: p.paramType ?? 'text',
          valueMode: p.valueMode ?? 'single',
          optionsSourceType: p.optionsSourceType ?? 'none',
          options: p.options ? JSON.stringify(p.options) : null,
          optionsQuery: p.optionsQuery ?? null,
          placeholder: p.placeholder ?? null,
          defaultValue: p.defaultValue ?? null,
          isRequired: p.isRequired ? 1 : 0,
          displayOrder: p.displayOrder ?? 0,
        }
      );
    }
  }

  // Mappings
  async getReportMappings(reportId: string): Promise<ReportMapping[]> {
    const rows = configDb<any>(
      'SELECT * FROM ReportMappings WHERE reportId = $reportId ORDER BY displayOrder',
      { reportId }
    );
    return rows.map(m => ({
      id: m.id,
      reportId: m.reportId,
      fieldName: m.fieldName,
      cellAddress: m.cellAddress ?? null,
      mappingType: (m.mappingType as any) ?? 'list',
      displayOrder: m.displayOrder ?? 0,
      sheetName: m.sheetName ?? null,
      recordsetIndex: m.recordsetIndex ?? 0,
      // Export config
      valueType: m.valueType ?? null,
      formatPattern: m.formatPattern ?? null,
    }));
  }

  async setReportMappings(reportId: string, mappings: CreateReportMappingDto[]): Promise<void> {
    configExec('DELETE FROM ReportMappings WHERE reportId = $reportId', { reportId });
    for (const m of mappings) {
      configExec(
        `INSERT INTO ReportMappings (
          id, reportId, fieldName, cellAddress, mappingType, displayOrder,
          sheetName, recordsetIndex, valueType, formatPattern
        ) VALUES (
          $id, $reportId, $fieldName, $cellAddress, $mappingType, $displayOrder,
          $sheetName, $recordsetIndex, $valueType, $formatPattern
        )`,
        {
          id: uuidv4(),
          reportId,
          fieldName: m.fieldName,
          cellAddress: m.cellAddress || null,
          mappingType: m.mappingType || 'list',
          displayOrder: m.displayOrder || 0,
          sheetName: m.sheetName || null,
          recordsetIndex: m.recordsetIndex ?? 0,
          valueType: m.valueType || null,
          formatPattern: m.formatPattern || null,
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
    // Use base64 string + { base64: true } — ExcelJS handles decode internally.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b64 = fs.readFileSync(filePath, 'base64');
    await (wb.xlsx.load as (data: any, opts?: any) => Promise<unknown>)(b64, { base64: true });
    return wb.worksheets.map(ws => ws.name);
  }
}

export const reportService = new ReportService();
