// =====================
// User types
// =====================
export interface User {
  id: string;
  username: string;
  password?: string;
  fullName: string | null;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  username: string;
  password: string;
  fullName?: string;
  role?: 'admin' | 'user';
}

export interface UpdateUserDto {
  fullName?: string;
  role?: 'admin' | 'user';
  isActive?: boolean;
  password?: string;
}

// =====================
// User Permissions (admin action permissions)
// =====================
export interface UserPermission {
  id: string;
  userId: string;
  canCreateReport: boolean;
  canEditReport: boolean;
  canDeleteReport: boolean;
  canCreateGroup: boolean;
  canEditGroup: boolean;
  canDeleteGroup: boolean;
}

export interface SetUserPermissionsDto {
  canCreateReport?: boolean;
  canEditReport?: boolean;
  canDeleteReport?: boolean;
  canCreateGroup?: boolean;
  canEditGroup?: boolean;
  canDeleteGroup?: boolean;
}

// =====================
// Report Group types
// =====================
export interface ReportGroup {
  id: string;
  name: string;
  icon: string;
  displayOrder: number;
  createdAt: Date;
}

export interface CreateReportGroupDto {
  name: string;
  icon?: string;
  displayOrder?: number;
}

export interface UpdateReportGroupDto {
  name?: string;
  icon?: string;
  displayOrder?: number;
}

// =====================
// User ↔ ReportGroup permissions (which groups a user can VIEW)
// =====================
export interface UserReportGroupPermission {
  id: string;
  userId: string;
  reportGroupId: string;
}

export interface SetUserReportGroupsDto {
  reportGroupIds: string[];
}

// =====================
// Full user payload (for user management UI)
// =====================
export interface UserWithPermissions {
  user: Omit<User, 'password'>;
  permissions: UserPermission | null;
  reportGroupIds: string[];
}

// =====================
// User action permission check result
// =====================
export interface UserActionPermissions {
  canCreateReport: boolean;
  canEditReport: boolean;
  canDeleteReport: boolean;
  canCreateGroup: boolean;
  canEditGroup: boolean;
  canDeleteGroup: boolean;
}

// =====================
// Report types
// =====================
export interface Report {
  id: string;
  name: string;
  groupName: string;
  groupIcon: string;
  spName: string;
  description: string | null;
  templateFile: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined
  parameters?: ReportParameter[];
  mappings?: ReportMapping[];
  permissions?: ReportPermission[];
}

export interface CreateReportDto {
  name: string;
  groupName?: string;
  groupIcon?: string;
  spName: string;
  description?: string;
  templateFile?: string;
}

export interface UpdateReportDto {
  name?: string;
  groupName?: string;
  groupIcon?: string;
  description?: string;
  templateFile?: string;
  spName?: string;
}

// =====================
// Report Parameter types
// =====================
export type ParamType = 'text' | 'date' | 'number' | 'select' | 'multiselect';

export interface ReportParameter {
  id: string;
  reportId: string;
  paramName: string;
  paramLabel: string | null;
  paramType: ParamType;
  defaultValue: string | null;
  isRequired: boolean;
  displayOrder: number;
  options: string[] | null;
}

export interface CreateReportParamDto {
  paramName: string;
  paramLabel?: string;
  paramType?: ParamType;
  defaultValue?: string;
  isRequired?: boolean;
  displayOrder?: number;
  options?: string[];
}

// =====================
// Report Mapping types
// =====================
export type MappingType = 'scalar' | 'list' | 'param';

export interface ReportMapping {
  id: string;
  reportId: string;
  fieldName: string;
  cellAddress: string | null;
  mappingType: MappingType;
  displayOrder: number;
  sheetName?: string | null;
  /**
   * Chỉ định lấy dữ liệu từ recordset nào.
   * 0 = recordset đầu tiên.
   * Nếu không có hoặc null → mặc định 0.
   */
  recordsetIndex?: number | null;
}

export interface CreateReportMappingDto {
  fieldName: string;
  cellAddress?: string;
  mappingType?: MappingType;
  displayOrder?: number;
  sheetName?: string;
  /** Chỉ định lấy dữ liệu từ recordset nào. Mặc định 0. */
  recordsetIndex?: number;
}

// =====================
// Permission types
// =====================
export interface ReportPermission {
  id: string;
  reportId: string;
  userId: string;
  canView: boolean;
  canExport: boolean;
}

export interface SetPermissionDto {
  canView?: boolean;
  canExport?: boolean;
}

// =====================
// Audit Log types
// =====================
export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'RUN_REPORT'
  | 'EXPORT_REPORT'
  | 'CREATE_REPORT'
  | 'UPDATE_REPORT'
  | 'DELETE_REPORT'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DELETE_USER'
  | 'SET_PERMISSION'
  | 'UPDATE_CONFIG';

export interface AuditLog {
  id: string;
  userId: string | null;
  action: AuditAction;
  target: string | null;
  ipAddress: string | null;
  timestamp: Date;
  details: string | null;
}

// =====================
// SP Metadata types
// =====================
export interface SPInfo {
  name: string;
}

export interface SPColumnMetadata {
  name: string;
  type: string;
  maxLength: number;
  precision: number;
  scale: number;
  isNullable: boolean;
}

export interface SPParameterMetadata {
  name: string;
  type: string;
  maxLength: number;
  precision: number;
  scale: number;
  isNullable: boolean;
  hasDefaultValue: boolean;
}

// =====================
// Query Result
// =====================

/**
 * Kết quả phân tích kiểu của một field trong một recordset cụ thể.
 *
 * Mỗi field chỉ có THẬT SỰ một kiểu, phát hiện bằng cách đọc giá trị thực tế.
 * Việc format Excel (numFmt) hoàn toàn dựa vào detectedType này.
 */
export type DetectedDataType = 'text' | 'number' | 'date' | 'datetime';

export interface FieldMetadata {
  /** Tên field, viết HOA để lookup ổn định */
  fieldName: string;
  /** Kiểu phát hiện từ dữ liệu thực tế — không phải từ schema */
  detectedType: DetectedDataType;
}

/**
 * Metadata cho một recordset cụ thể.
 * Dùng để export quyết định chính xác kiểu của từng field trong recordset đó.
 */
export interface RecordsetMetadata {
  recordsetIndex: number;
  /** Danh sách field metadata, thứ tự giống cột đầu tiên của recordset */
  fields: FieldMetadata[];
}

/**
 * QueryResult mới: thay `dateColumns: string[]` bằng `recordsetMetadata: RecordsetMetadata[]`.
 *
 * Cách dùng khi export:
 *   1. Với một mapping (scalar/list), xác định recordsetIndex của nó.
 *   2. Tìm RecordsetMetadata tương ứng.
 *   3. Lookup FieldMetadata[fieldName] → detectedType.
 *   4. detectedType === 'date'     → serial + numFmt: 'dd/MM/yyyy'
 *      detectedType === 'datetime' → serial + numFmt: 'dd/MM/yyyy HH:mm:ss'
 *      detectedType === 'number'   → giữ nguyên number
 *      detectedType === 'text'     → giữ nguyên text
 *
 * Backward compat: `dateColumns` vẫn giữ lại trong interface để client cũ không bị break.
 */
export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  recordsets?: Record<string, any>[][];
  /**
   * Metadata chi tiết cho TỪNG recordset. Đây là nguồn thật cho export.
   * @deprecated Dùng recordsetMetadata thay thế.
   */
  dateColumns?: string[];
  /** Metadata kiểu dữ liệu theo từng recordset — dùng để resolve format khi export */
  recordsetMetadata?: RecordsetMetadata[];
}

// =====================
// Auth types
// =====================
export interface LoginDto {
  username: string;
  password: string;
}

export interface AuthPayload {
  userId: string;
  username: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, 'password'>;
}

// =====================
// API Response
// =====================
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
