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

/** Loại tham số cho UI nhập liệu — quyết định cách user nhập giá trị */
export type ParamType =
  | 'text'      // text input
  | 'number'    // number input
  | 'date'      // date picker
  | 'datetime'  // datetime picker
  | 'select'    // single select
  | 'multiselect' // multi select
  | 'textarea'; // multiline text

/** Cách serialize giá trị khi gửi xuống stored procedure */
export type ValueMode = 'single' | 'csv' | 'json';

/** Nguồn lấy options cho select/multiselect */
export type OptionsSourceType = 'none' | 'static' | 'sql';

/** Một option cho select/multiselect */
export interface ParamOption {
  value: string;
  label: string;
}

/** Cấu hình đầy đủ của một tham số báo cáo.
 *
 * 2 tầng metadata:
 *  • sql metadata: từ SP (sqlType, maxLength, precision, scale, isNullable, hasDefaultValue)
 *    → dùng để gợi ý ban đầu cho admin
 *  • business config: do admin quyết định (paramType, valueMode, options, v.v.)
 *    → dùng để render UI và serialize khi chạy thật
 */
export interface ReportParameter {
  id: string;
  reportId: string;
  paramName: string;        // tên gốc SP (giữ nguyên @ nếu có)
  paramLabel: string | null; // label hiển thị

  // SQL metadata (từ SP — read only, dùng để gợi ý)
  sqlType?: string | null;
  maxLength?: number | null;
  precision?: number | null;
  scale?: number | null;
  isNullable?: boolean;
  hasDefaultValue?: boolean;

  // Business config (do admin quyết định)
  paramType: ParamType;
  valueMode: ValueMode;          // cách serialize: single / csv / json
  optionsSourceType: OptionsSourceType; // nguồn options
  /** Options tĩnh — dùng khi optionsSourceType = 'static' */
  options: ParamOption[] | null;
  /** Query SQL lấy options — dùng khi optionsSourceType = 'sql' */
  optionsQuery: string | null;
  placeholder: string | null;
  defaultValue: string | null;
  isRequired: boolean;
  displayOrder: number;
}

export interface CreateReportParamDto {
  paramName: string;
  paramLabel?: string;

  // SQL metadata
  sqlType?: string | null;
  maxLength?: number | null;
  precision?: number | null;
  scale?: number | null;
  isNullable?: boolean;
  hasDefaultValue?: boolean;

  // Business config
  paramType?: ParamType;
  valueMode?: ValueMode;
  optionsSourceType?: OptionsSourceType;
  options?: ParamOption[] | null;
  optionsQuery?: string | null;
  placeholder?: string | null;
  defaultValue?: string | null;
  isRequired?: boolean;
  displayOrder?: number;
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
   * BẮT BUỘC rõ ràng với scalar/list.
   */
  recordsetIndex?: number | null;

  // ── Export config (nguồn sự thật cho Excel) ────────────────
  /**
   * Kiểu giá trị khi export.
   * DETERMINISTIC: mapping quyết định, không đoán từ data runtime.
   *
   * Backward compat: nếu null → fallback an toàn:
   *   • 'text' cho param mapping
   *   • 'text' cho scalar/list nếu không detect được
   */
  valueType?: 'text' | 'number' | 'date' | 'datetime' | null;
  /**
   * Pattern format tùy chỉnh.
   * Nếu null → dùng format mặc định theo valueType.
   * Ví dụ: 'yyyy-MM-dd' cho date override.
   */
  formatPattern?: string | null;
}

export interface CreateReportMappingDto {
  fieldName: string;
  cellAddress?: string;
  mappingType?: MappingType;
  displayOrder?: number;
  sheetName?: string;
  recordsetIndex?: number;
  /** Kiểu giá trị khi export. Mặc định 'text'. */
  valueType?: 'text' | 'number' | 'date' | 'datetime' | null;
  /** Pattern format tùy chỉnh. */
  formatPattern?: string | null;
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
 * QueryResult: kết quả execute stored procedure.
 *
 * Chứa cả data đã convert và metadata kiểu theo từng recordset.
 * Backend export dùng recordsetMetadata/executionMetadata.
 * Frontend preview dùng rows/columns.
 *
 * Backward compat: dateColumns được giữ lại (global string[]) cho client cũ.
 */
export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  recordsets?: Record<string, any>[][];
  /**
   * @deprecated Dùng recordsetMetadata thay thế.
   * Legacy global date column names — dùng bởi client cũ.
   */
  dateColumns?: string[];
  /**
   * Metadata kiểu chi tiết cho TỪNG recordset.
   * Nguồn thật cho Excel export.
   */
  recordsetMetadata?: import('./excel.types.js').RecordsetMetadata[];
  /**
   * Wrapper chuẩn hóa cho recordsetMetadata.
   * Dùng khi cần truyền metadata rõ ràng qua các layer.
   */
  executionMetadata?: import('./excel.types.js').QueryExecutionMetadata;
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
