import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../contexts/ToastContext';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { error: showError } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      showError('Vui lòng nhập username và password');
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      showError(err.response?.data?.error || err.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200 mb-4">
            <span className="text-white font-black text-2xl">HIS</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            HIS <span className="text-blue-600">REPORTS</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 font-medium">Hệ thống Báo cáo Bệnh viện</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8">
          <h2 className="text-lg font-black text-slate-800 mb-6">Đăng nhập</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Tên đăng nhập"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập username"
              autoFocus
            />

            <Input
              label="Mật khẩu"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e as any)}
            />

            <Button type="submit" loading={loading} className="w-full mt-2">
              🔑 Đăng nhập
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} HIS Reports · Bệnh viện
        </p>
      </div>
    </div>
  );
};
