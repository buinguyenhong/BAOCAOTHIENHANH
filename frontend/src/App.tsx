import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { Toast } from './components/ui/Modal';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ReportDesigner } from './pages/ReportDesigner';
import { UserManagement } from './pages/UserManagement';
import { PermissionManager } from './pages/PermissionManager';
import { SystemConfig } from './pages/SystemConfig';

const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({
  children,
  adminOnly = false,
}) => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-slate-400 font-medium">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-black text-lg">HIS</span>
          </div>
          <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/design"
        element={
          <ProtectedRoute adminOnly>
            <ReportDesigner />
          </ProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <ProtectedRoute adminOnly>
            <UserManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/permissions"
        element={
          <ProtectedRoute adminOnly>
            <PermissionManager />
          </ProtectedRoute>
        }
      />

      <Route
        path="/system"
        element={
          <ProtectedRoute adminOnly>
            <SystemConfig />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <Toast />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
