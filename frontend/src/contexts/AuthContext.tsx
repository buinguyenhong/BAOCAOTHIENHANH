import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, UserPermission } from '../types';
import { authApi } from '../api/auth.api';

interface UserActionPerms {
  canCreateReport: boolean;
  canEditReport: boolean;
  canDeleteReport: boolean;
  canCreateGroup: boolean;
  canEditGroup: boolean;
  canDeleteGroup: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  actionPerms: UserActionPerms;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshActionPerms: () => Promise<void>;
}

const DEFAULT_PERMS: UserActionPerms = {
  canCreateReport: false,
  canEditReport: false,
  canDeleteReport: false,
  canCreateGroup: false,
  canEditGroup: false,
  canDeleteGroup: false,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [actionPerms, setActionPerms] = useState<UserActionPerms>(DEFAULT_PERMS);

  const fetchPerms = useCallback(async (u: User) => {
    try {
      const res = await authApi.me();
      if (res.success && res.data) {
        // Admin luôn có full perms (backend trả về role=admin)
        if (res.data.role === 'admin') {
          setActionPerms({
            canCreateReport: true,
            canEditReport: true,
            canDeleteReport: true,
            canCreateGroup: true,
            canEditGroup: true,
            canDeleteGroup: true,
          });
        } else {
          // Lấy từ backend (tương lai: API riêng cho action perms)
          // Hiện tại: fallback = không có quyền
          setActionPerms(DEFAULT_PERMS);
        }
        setUser(res.data);
      }
    } catch {
      // ignore
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await authApi.me();
      if (res.success && res.data) {
        setUser(res.data);
        setToken(storedToken);
        if (res.data.role === 'admin') {
          setActionPerms({
            canCreateReport: true,
            canEditReport: true,
            canDeleteReport: true,
            canCreateGroup: true,
            canEditGroup: true,
            canDeleteGroup: true,
          });
        } else {
          setActionPerms(DEFAULT_PERMS);
        }
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        setActionPerms(DEFAULT_PERMS);
      }
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
      setActionPerms(DEFAULT_PERMS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    if (!res.success) throw new Error(res.error);

    const { token: newToken, user: newUser } = res.data!;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);

    if (newUser.role === 'admin') {
      setActionPerms({
        canCreateReport: true,
        canEditReport: true,
        canDeleteReport: true,
        canCreateGroup: true,
        canEditGroup: true,
        canDeleteGroup: true,
      });
    } else {
      setActionPerms(DEFAULT_PERMS);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout error
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setActionPerms(DEFAULT_PERMS);
  };

  const refreshActionPerms = async () => {
    if (user) {
      await fetchPerms(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        isAdmin: user?.role === 'admin',
        actionPerms,
        login,
        logout,
        checkAuth,
        refreshActionPerms,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
