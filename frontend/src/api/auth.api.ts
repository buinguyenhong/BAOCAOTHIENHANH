import api from './client';
import type { LoginResponse, ApiResponse, User } from '../types';

export const authApi = {
  login: async (username: string, password: string): Promise<ApiResponse<LoginResponse>> => {
    const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', { username, password });
    return res.data;
  },

  logout: async (): Promise<ApiResponse> => {
    const res = await api.post<ApiResponse>('/auth/logout');
    return res.data;
  },

  me: async (): Promise<ApiResponse<User>> => {
    const res = await api.get<ApiResponse<User>>('/auth/me');
    return res.data;
  },

  changePassword: async (oldPassword: string, newPassword: string): Promise<ApiResponse> => {
    const res = await api.post<ApiResponse>('/auth/change-password', { oldPassword, newPassword });
    return res.data;
  },
};
