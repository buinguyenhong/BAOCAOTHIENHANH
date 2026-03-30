import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../contexts/ToastContext';
import { systemApi } from '../api/report.api';
import type { ConnectionStatus } from '../types';

export const SystemConfig: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  // Form
  const [server, setServer] = useState('');
  const [database, setDatabase] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await systemApi.getConnectionStatus();
      if (res.success && res.data) {
        setStatus(res.data);
      }
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSave = async () => {
    if (!server || !database || !user) {
      showError('Server, Database và User là bắt buộc');
      return;
    }

    setSaving(true);
    try {
      const res = await systemApi.setupConnection({ server, database, user, password });
      if (res.success) {
        success('Cấu hình kết nối thành công!');
        fetchStatus();
      } else {
        showError(res.error || 'Lỗi cấu hình');
      }
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const ConnectionBadge: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
    <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border-2 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
        <span className="text-white text-lg">{ok ? '✅' : '❌'}</span>
      </div>
      <div>
        <p className={`text-sm font-bold ${ok ? 'text-emerald-800' : 'text-red-800'}`}>{label}</p>
        <p className={`text-xs ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {ok ? 'Đã kết nối thành công' : 'Chưa kết nối'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar groups={[]} onClose={() => navigate('/')} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-black text-slate-800">⚙️ Cấu hình Hệ thống</h2>
            <p className="text-xs text-slate-400 mt-0.5">Cấu hình kết nối cơ sở dữ liệu HIS</p>
          </div>

          {/* Connection Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
            <ConnectionBadge ok={status?.configDB || false} label="ConfigDB (SQLite)" />
            <ConnectionBadge ok={status?.hospitalDB || false} label="HospitalDB (Cơ sở dữ liệu HIS)" />
          </div>

          {/* Config Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 shrink-0">
            <h3 className="text-lg font-black text-slate-800 mb-6">Cấu hình kết nối HospitalDB</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Server *"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  placeholder="VD: localhost hoặc 192.168.1.100"
                />
                <Input
                  label="Database *"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="VD: HospitalDB"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Username *"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="VD: sa"
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu SQL Server"
                />
              </div>

              <div className="pt-4 flex items-center gap-3">
                <Button loading={saving} onClick={handleSave} icon={<span>💾</span>}>
                  Lưu & Kiểm tra kết nối
                </Button>
                <Button variant="secondary" onClick={fetchStatus} loading={loading}>
                  🔄 Kiểm tra lại
                </Button>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 rounded-2xl border border-blue-100 p-6">
            <h4 className="text-sm font-black text-blue-800 mb-3">ℹ️ Thông tin hệ thống</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-blue-600 font-bold">ConfigDB</p>
                <p className="text-blue-500 text-xs mt-1">
                  Database lưu cấu hình báo cáo, users, và phân quyền.
                  <br />
                  Storage: <code className="bg-blue-100 px-1 rounded">backend/data/hisreports.db</code> (SQLite)
                </p>
              </div>
              <div>
                <p className="text-blue-600 font-bold">HospitalDB</p>
                <p className="text-blue-500 text-xs mt-1">
                  Database HIS của bệnh viện — chứa các Stored Procedure báo cáo.
                  <br />
                  Cấu hình qua form trên.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
