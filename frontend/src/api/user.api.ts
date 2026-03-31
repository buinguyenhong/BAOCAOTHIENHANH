import api from './client';
import type {
  ApiResponse,
  User,
  ReportPermission,
  UserPermission,
  SetUserPermissionsDto,
  ReportGroup,
  CreateReportGroupDto,
  UserWithPermissions,
} from '../types';

export const userApi = {
  // ─── Users ─────────────────────────────────────────────────

  /** GET /api/users — Danh sách user kèm permissions */
  getAllUsers: async (): Promise<ApiResponse<UserWithPermissions[]>> => {
    const res = await api.get<ApiResponse<UserWithPermissions[]>>('/users');
    return res.data;
  },

  /** GET /api/users/:id — Chi tiết user kèm permissions */
  getUser: async (id: string): Promise<ApiResponse<UserWithPermissions>> => {
    const res = await api.get<ApiResponse<UserWithPermissions>>(`/users/${id}`);
    return res.data;
  },

  /** POST /api/users — Tạo user mới (kèm permissions + report groups) */
  createUser: async (data: {
    username: string;
    password: string;
    fullName?: string;
    role?: 'admin' | 'user';
    permissions?: SetUserPermissionsDto;
    reportGroupIds?: string[];
  }): Promise<ApiResponse<UserWithPermissions>> => {
    const res = await api.post<ApiResponse<UserWithPermissions>>('/users', data);
    return res.data;
  },

  /** PUT /api/users/:id — Cập nhật user */
  updateUser: async (
    id: string,
    data: {
      fullName?: string;
      role?: 'admin' | 'user';
      isActive?: boolean;
      password?: string;
      permissions?: SetUserPermissionsDto;
      reportGroupIds?: string[];
    }
  ): Promise<ApiResponse<UserWithPermissions>> => {
    const res = await api.put<ApiResponse<UserWithPermissions>>(`/users/${id}`, data);
    return res.data;
  },

  /** DELETE /api/users/:id — Xóa user */
  deleteUser: async (id: string): Promise<ApiResponse> => {
    const res = await api.delete<ApiResponse>(`/users/${id}`);
    return res.data;
  },

  /** POST /api/users/:id/reset-password — Reset password */
  resetPassword: async (id: string, newPassword: string): Promise<ApiResponse> => {
    const res = await api.post<ApiResponse>(`/users/${id}/reset-password`, { newPassword });
    return res.data;
  },

  // ─── Report Groups ─────────────────────────────────────────

  /** GET /api/report-groups — Danh sách nhóm báo cáo */
  getReportGroups: async (): Promise<ApiResponse<ReportGroup[]>> => {
    const res = await api.get<ApiResponse<ReportGroup[]>>('/report-groups');
    return res.data;
  },

  /** POST /api/report-groups — Tạo nhóm báo cáo */
  createReportGroup: async (data: CreateReportGroupDto): Promise<ApiResponse<ReportGroup>> => {
    const res = await api.post<ApiResponse<ReportGroup>>('/report-groups', data);
    return res.data;
  },

  /** PUT /api/report-groups/:id — Cập nhật nhóm */
  updateReportGroup: async (id: string, data: Partial<CreateReportGroupDto>): Promise<ApiResponse<ReportGroup>> => {
    const res = await api.put<ApiResponse<ReportGroup>>(`/report-groups/${id}`, data);
    return res.data;
  },

  /** DELETE /api/report-groups/:id — Xóa nhóm */
  deleteReportGroup: async (id: string): Promise<ApiResponse> => {
    const res = await api.delete<ApiResponse>(`/report-groups/${id}`);
    return res.data;
  },

  // ─── Legacy per-report permissions (backward compat) ────────

  getPermissions: async (userId: string): Promise<ApiResponse<ReportPermission[]>> => {
    const res = await api.get<ApiResponse<ReportPermission[]>>(`/users/${userId}/permissions`);
    return res.data;
  },

  setPermissions: async (
    userId: string,
    permissions: Array<{ reportId: string; canView?: boolean; canExport?: boolean }>
  ): Promise<ApiResponse> => {
    const res = await api.put<ApiResponse>(`/users/${userId}/permissions`, { permissions });
    return res.data;
  },

  bulkSetPermissions: async (
    userIds: string[],
    reportIds: string[],
    canView: boolean,
    canExport: boolean
  ): Promise<ApiResponse> => {
    const res = await api.post<ApiResponse>('/users/bulk-permissions', {
      userIds,
      reportIds,
      canView,
      canExport,
    });
    return res.data;
  },
};
