import api from './client';
import type { ApiResponse, User, ReportPermission } from '../types';

export const userApi = {
  getAllUsers: async (): Promise<ApiResponse<User[]>> => {
    const res = await api.get<ApiResponse<User[]>>('/users');
    return res.data;
  },

  createUser: async (data: {
    username: string;
    password: string;
    fullName?: string;
    role?: 'admin' | 'user';
  }): Promise<ApiResponse<User>> => {
    const res = await api.post<ApiResponse<User>>('/users', data);
    return res.data;
  },

  updateUser: async (id: string, data: Partial<User>): Promise<ApiResponse<User>> => {
    const res = await api.put<ApiResponse<User>>(`/users/${id}`, data);
    return res.data;
  },

  deleteUser: async (id: string): Promise<ApiResponse> => {
    const res = await api.delete<ApiResponse>(`/users/${id}`);
    return res.data;
  },

  resetPassword: async (id: string, newPassword: string): Promise<ApiResponse> => {
    const res = await api.post<ApiResponse>(`/users/${id}/reset-password`, { newPassword });
    return res.data;
  },

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
