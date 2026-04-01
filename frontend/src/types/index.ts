// User
export interface User {
  id: string;
  username: string;
  fullName: string | null;
  role: 'admin' | 'user';
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// User Permissions (admin action permissions)
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

// Report Group
export interface ReportGroup {
  id: string;
  name: string;
  icon: string;
  displayOrder: number;
  createdAt?: string;
}

export interface ReportGroupView {
  id: string;
  name: string;
  icon: string;
  reports: Report[];
}

export interface CreateReportGroupDto {
  name: string;
  icon?: string;
  displayOrder?: number;
}

// User ↔ ReportGroup permissions
export interface UserReportGroupPermission {
  id: string;
  userId: string;
  reportGroupId: string;
}

// Full user payload
export interface UserWithPermissions {
  user: Omit<User, 'password'>;
  permissions: UserPermission | null;
  reportGroupIds: string[];
}

// Auth
export interface LoginResponse {
  token: string;
  user: User;
}

// ─────────────────────────────────────────────
// Report Parameter types
// ─────────────────────────────────────────────

/** Loại tham số cho UI nhập liệu */
export type ParamType = 'text' | 'number' | 'date' | 'datetime' | 'select' | 'multiselect' | 'textarea';

/** Cách serialize giá trị khi gửi xuống SP */
export type ValueMode = 'single' | 'csv' | 'json';

/** Nguồn options cho select/multiselect */
export type OptionsSourceType = 'none' | 'static' | 'sql';

/** Một option cho select/multiselect */
export interface ParamOption {
  value: string;
  label: string;
}

export interface ReportParameter {
  id: string;
  reportId: string;
  paramName: string;
  paramLabel: string | null;

  // SQL metadata (từ SP)
  sqlType?: string | null;
  maxLength?: number | null;
  precision?: number | null;
  scale?: number | null;
  isNullable?: boolean;
  hasDefaultValue?: boolean;

  // Business config (do admin quyết định)
  paramType: ParamType;
  valueMode: ValueMode;
  optionsSourceType: OptionsSourceType;
  options: ParamOption[] | null;
  optionsQuery: string | null;
  placeholder: string | null;
  defaultValue: string | null;
  isRequired: boolean;
  displayOrder: number;
}

export interface CreateParamDto {
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

// ─────────────────────────────────────────────
// Report Mapping types
// ─────────────────────────────────────────────

export type MappingType = 'scalar' | 'list' | 'param';

/**
 * Loại giá trị quyết định cách convert khi export Excel.
 * NGUỒN SỰ THẬT DUY NHẤT cho export — không đoán từ runtime.
 */
export type MappingValueType = 'text' | 'number' | 'date' | 'datetime';

export interface ReportMapping {
  id: string;
  reportId: string;
  fieldName: string;
  cellAddress: string | null;
  mappingType: MappingType;
  displayOrder: number;
  sheetName?: string | null;
  /** Chỉ định lấy dữ liệu từ recordset nào. 0 = đầu tiên. */
  recordsetIndex?: number | null;

  // Export config (nguồn sự thật)
  /** Kiểu giá trị khi export. DETERMINISTIC. */
  valueType?: MappingValueType | null;
  /** Pattern format tùy chỉnh. Null = dùng mặc định. */
  formatPattern?: string | null;
}

export interface CreateMappingDto {
  fieldName: string;
  cellAddress?: string;
  mappingType?: MappingType;
  displayOrder?: number;
  sheetName?: string;
  recordsetIndex?: number;
  /** Kiểu giá trị khi export. Mặc định 'text'. */
  valueType?: MappingValueType | null;
  /** Pattern format tùy chỉnh. */
  formatPattern?: string | null;
}

// ─────────────────────────────────────────────
// Report / Permission
// ─────────────────────────────────────────────

export interface ReportPermission {
  id: string;
  reportId: string;
  userId: string;
  canView: boolean;
  canExport: boolean;
}

export interface Report {
  id: string;
  name: string;
  groupName: string;
  groupIcon: string;
  spName: string;
  description: string | null;
  templateFile: string | null;
  reportGroupId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  parameters: ReportParameter[];
  mappings: ReportMapping[];
  permissions?: ReportPermission[];
}

export interface CreateReportDto {
  name: string;
  groupName?: string;
  groupIcon?: string;
  spName: string;
  description?: string;
  parameters?: CreateParamDto[];
  mappings?: CreateMappingDto[];
}

// ─────────────────────────────────────────────
// Query Result
// ─────────────────────────────────────────────

export interface RecordsetMetadata {
  recordsetIndex: number;
  fields: FieldMetadata[];
}

export interface FieldMetadata {
  fieldName: string;
  normalizedFieldName: string;
  detectedType: 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'unknown';
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  recordsets?: Record<string, any>[][];
  /** Metadata kiểu theo từng recordset — nguồn thật cho export */
  recordsetMetadata?: RecordsetMetadata[];
  /** @deprecated Legacy */
  dateColumns?: string[];
}

// ─────────────────────────────────────────────
// SP Metadata
// ─────────────────────────────────────────────

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

export interface SPMetadata {
  columns: SPColumnMetadata[];
  parameters: SPParameterMetadata[];
  recordsets?: Record<string, any>[][];
}

export interface TestRunResult {
  columns: string[];
  rows: Record<string, any>[];
  params: SPParameterMetadata[];
  recordsets: Record<string, any>[][];
}

// ─────────────────────────────────────────────
// System / API
// ─────────────────────────────────────────────

export interface ConnectionStatus {
  configDB: boolean;
  hospitalDB: boolean;
  hospitalConfigured: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
