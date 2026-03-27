import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Card';
import { useToast } from '../contexts/ToastContext';
import { userApi } from '../api/user.api';
import type { User } from '../types';

export const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'user'>('user');
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPwUser, setResetPwUser] = useState<User | null>(null);
  const [newPw, setNewPw] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userApi.getAllUsers();
      if (res.success && res.data) {
        setUsers(res.data);
      }
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []);

  const openNewForm = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormFullName('');
    setFormRole('user');
    setFormIsActive(true);
    setShowForm(true);
  };

  const openEditForm = (user: User) => {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormPassword('');
    setFormFullName(user.fullName || '');
    setFormRole(user.role);
    setFormIsActive(!!user.isActive);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!editingUser && (!formUsername || !formPassword)) {
      showError('Username và password là bắt buộc');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        await userApi.updateUser(editingUser.id, {
          fullName: formFullName,
          role: formRole,
          isActive: formIsActive,
        });
        success('Cập nhật user thành công!');
      } else {
        await userApi.createUser({
          username: formUsername,
          password: formPassword,
          fullName: formFullName,
          role: formRole,
        });
        success('Tạo user mới thành công!');
      }
      setShowForm(false);
      fetchUsers();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Xóa user "${username}"?`)) return;
    setDeleting(id);
    try {
      await userApi.deleteUser(id);
      success('Đã xóa user');
      fetchUsers();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleResetPassword = async () => {
    if (!newPw || newPw.length < 6) {
      showError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    try {
      await userApi.resetPassword(resetPwUser!.id, newPw);
      success('Đặt lại mật khẩu thành công!');
      setShowResetPw(false);
      setResetPwUser(null);
      setNewPw('');
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar groups={[]} onClose={() => navigate('/')} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-black text-slate-800">👤 Quản lý Người dùng</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tạo, sửa và xóa tài khoản người dùng</p>
            </div>
            <Button onClick={openNewForm} icon={<span>➕</span>}>
              Tạo người dùng mới
            </Button>
          </div>

          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="overflow-auto h-full">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Người dùng</th>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Username</th>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Vai trò</th>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Trạng thái</th>
                      <th className="px-6 py-4 text-right text-[11px] font-black text-slate-500 uppercase">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                              <span className="text-blue-600 font-black text-sm">
                                {user.fullName?.charAt(0) || user.username.charAt(0)}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-slate-800">{user.fullName || '—'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">@{user.username}</code>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={user.role === 'admin' ? 'info' : 'default'}>
                            {user.role === 'admin' ? 'Quản trị' : 'Người dùng'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={user.isActive ? 'success' : 'danger'}>
                            {user.isActive ? 'Hoạt động' : 'Bị khóa'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditForm(user)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              ✏️ Sửa
                            </button>
                            <button
                              onClick={() => {
                                setResetPwUser(user);
                                setShowResetPw(true);
                              }}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                            >
                              🔑 Mật khẩu
                            </button>
                            <button
                              onClick={() => handleDelete(user.id, user.username)}
                              disabled={deleting === user.id}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              {deleting === user.id ? '...' : '🗑️'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit User Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingUser ? '✏️ Cập nhật người dùng' : '➕ Tạo người dùng mới'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Hủy</Button>
            <Button loading={saving} onClick={handleSave}>
              {editingUser ? 'Lưu' : 'Tạo'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Username *"
            value={formUsername}
            onChange={(e) => setFormUsername(e.target.value)}
            placeholder="Tên đăng nhập"
            disabled={!!editingUser}
          />
          {!editingUser && (
            <Input
              label="Mật khẩu *"
              type="password"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              placeholder="Ít nhất 6 ký tự"
            />
          )}
          <Input
            label="Họ và tên"
            value={formFullName}
            onChange={(e) => setFormFullName(e.target.value)}
            placeholder="Họ và tên đầy đủ"
          />
          <Select
            label="Vai trò"
            value={formRole}
            onChange={(e) => setFormRole(e.target.value as 'admin' | 'user')}
            options={[
              { value: 'user', label: 'Người dùng' },
              { value: 'admin', label: 'Quản trị viên' },
            ]}
          />
          {editingUser && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
                Tài khoản hoạt động
              </label>
            </div>
          )}
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={showResetPw}
        onClose={() => { setShowResetPw(false); setResetPwUser(null); setNewPw(''); }}
        title={`🔑 Đặt lại mật khẩu: ${resetPwUser?.username}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowResetPw(false); setResetPwUser(null); }}>Hủy</Button>
            <Button onClick={handleResetPassword}>Lưu mật khẩu</Button>
          </>
        }
      >
        <Input
          label="Mật khẩu mới"
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          placeholder="Ít nhất 6 ký tự"
        />
      </Modal>
    </div>
  );
};
