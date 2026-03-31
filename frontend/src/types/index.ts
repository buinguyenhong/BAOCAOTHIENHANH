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

// Report Group (standalone — từ backend)
export interface ReportGroup {
  id: string;
  name: string;
  icon: string;
  displayOrder: number;
  createdAt?: string;
}

// ReportGroup với danh sách báo cáo (cho Sidebar)
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

// Full user payload for management UI
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

// Report Parameter
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

// Report Mapping
export type MappingType = 'scalar' | 'list' | 'param';
export interface ReportMapping {
  id: string;
  reportId: string;
  fieldName: string;
  cellAddress: string | null;
  mappingType: MappingType;
  displayOrder: number;
  sheetName?: string | null;
}

// Report Permission
export interface ReportPermission {
  id: string;
  reportId: string;
  userId: string;
  canView: boolean;
  canExport: boolean;
}

// Report
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

// Query Result
export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  recordsets?: Record<string, any>[][];
}

// SP Metadata
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

// Test Run Result (from backend /sp-metadata/test-run)
export interface TestRunResult {
  columns: string[];
  rows: Record<string, any>[];
  params: SPParameterMetadata[];
  recordsets: Record<string, any>[][];
}

// Connection Status
export interface ConnectionStatus {
  configDB: boolean;
  hospitalDB: boolean;
  hospitalConfigured: boolean;
}

// API Response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Create/Update DTOs
export interface CreateReportDto {
  name: string;
  groupName?: string;
  groupIcon?: string;
  spName: string;
  description?: string;
  parameters?: CreateParamDto[];
  mappings?: CreateMappingDto[];
}

export interface CreateParamDto {
  paramName: string;
  paramLabel?: string;
  paramType?: ParamType;
  defaultValue?: string;
  isRequired?: boolean;
  displayOrder?: number;
  options?: string[];
}

export interface CreateMappingDto {
  fieldName: string;
  cellAddress?: string;
  mappingType?: MappingType;
  displayOrder?: number;
  sheetName?: string;
  resultSetIndex?: number; // Index của result set (0, 1, 2...)
}
