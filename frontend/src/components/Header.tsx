import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { authApi } from '../api/auth.api';
import { useToast } from '../contexts/ToastContext';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { user, logout, isAdmin } = useAuth();
  const { success, error } = useToast();
  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      error('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    setChanging(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      success('Đổi mật khẩu thành công!');
      setShowPassword(false);
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      error(err.response?.data?.error || 'Lỗi đổi mật khẩu');
    } finally {
      setChanging(false);
    }
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-sm">HIS</span>
            </div>
            <div>
              <h1 className="font-black text-base tracking-tight text-slate-800 leading-none">
                HIS <span className="text-blue-600">REPORTS</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wide">Hệ thống Báo cáo Bệnh viện</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 text-[10px] font-black uppercase tracking-wider border border-purple-100">
              Quản trị
            </span>
          )}

          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 font-black text-xs">
                {user?.fullName?.charAt(0) || user?.username?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-slate-700 leading-none">
                {user?.fullName || user?.username}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">@{user?.username}</p>
            </div>
          </div>

          <button
            onClick={() => setShowProfile(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors text-sm"
            title="Tài khoản"
          >
            ⚙️
          </button>

          <button
            onClick={logout}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
            title="Đăng xuất"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Profile Modal */}
      <Modal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        title="Tài khoản của tôi"
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setShowProfile(false)}>
            Đóng
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-blue-600 font-black text-2xl">
                {user?.fullName?.charAt(0) || user?.username?.charAt(0) || 'U'}
              </span>
            </div>
            <div>
              <p className="font-bold text-slate-800 text-lg">{user?.fullName || user?.username}</p>
              <p className="text-sm text-slate-400">@{user?.username}</p>
              <span className={`inline-block mt-1 text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                user?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {user?.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setShowProfile(false);
              setShowPassword(true);
            }}
          >
            🔑 Đổi mật khẩu
          </Button>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPassword}
        onClose={() => {
          setShowPassword(false);
          setOldPassword('');
          setNewPassword('');
        }}
        title="Đổi mật khẩu"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPassword(false)}>
              Hủy
            </Button>
            <Button loading={changing} onClick={handleChangePassword}>
              Lưu mật khẩu
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Mật khẩu cũ"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="Nhập mật khẩu cũ"
          />
          <Input
            label="Mật khẩu mới"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Ít nhất 6 ký tự"
          />
        </div>
      </Modal>
    </>
  );
};
