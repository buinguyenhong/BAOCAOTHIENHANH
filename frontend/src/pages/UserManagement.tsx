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
import type { UserWithPermissions, ReportGroup, UserPermission } from '../types';

interface FormState {
  username: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  permissions: {
    canCreateReport: boolean;
    canEditReport: boolean;
    canDeleteReport: boolean;
    canCreateGroup: boolean;
    canEditGroup: boolean;
    canDeleteGroup: boolean;
  };
  reportGroupIds: string[];
}

const EMPTY_FORM = (): FormState => ({
  username: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  role: 'user',
  isActive: true,
  permissions: {
    canCreateReport: false,
    canEditReport: false,
    canDeleteReport: false,
    canCreateGroup: false,
    canEditGroup: false,
    canDeleteGroup: false,
  },
  reportGroupIds: [],
});

export const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithPermissions | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM());
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPwUser, setResetPwUser] = useState<UserWithPermissions | null>(null);
  const [newPw, setNewPw] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupIcon, setNewGroupIcon] = useState('📂');
  const [savingGroup, setSavingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ReportGroup | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, groupsRes] = await Promise.all([
        userApi.getAllUsers(),
        userApi.getReportGroups(),
      ]);
      if (usersRes.success && usersRes.data) setUsers(usersRes.data);
      if (groupsRes.success && groupsRes.data) setGroups(groupsRes.data);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, []);

  // ── Form helpers ────────────────────────────────────────────

  const setPerm = (key: keyof FormState['permissions'], value: boolean) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: value } }));
  };

  const toggleGroup = (groupId: string) => {
    setForm(f => ({
      ...f,
      reportGroupIds: f.reportGroupIds.includes(groupId)
        ? f.reportGroupIds.filter(id => id !== groupId)
        : [...f.reportGroupIds, groupId],
    }));
  };

  const selectAllGroups = () => {
    setForm(f => ({ ...f, reportGroupIds: groups.map(g => g.id) }));
  };

  const deselectAllGroups = () => {
    setForm(f => ({ ...f, reportGroupIds: [] }));
  };

  // ── Open form ───────────────────────────────────────────────

  const openNewForm = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM());
    setFormErrors({});
    setShowForm(true);
  };

  const openEditForm = (u: UserWithPermissions) => {
    setEditingUser(u);
    setForm({
      username: u.user.username,
      password: '',
      confirmPassword: '',
      fullName: u.user.fullName || '',
      role: u.user.role,
      isActive: !!u.user.isActive,
      permissions: u.permissions
        ? {
            canCreateReport: !!u.permissions.canCreateReport,
            canEditReport: !!u.permissions.canEditReport,
            canDeleteReport: !!u.permissions.canDeleteReport,
            canCreateGroup: !!u.permissions.canCreateGroup,
            canEditGroup: !!u.permissions.canEditGroup,
            canDeleteGroup: !!u.permissions.canDeleteGroup,
          }
        : { canCreateReport: false, canEditReport: false, canDeleteReport: false, canCreateGroup: false, canEditGroup: false, canDeleteGroup: false },
      reportGroupIds: u.reportGroupIds || [],
    });
    setFormErrors({});
    setShowForm(true);
  };

  // ── Validate ────────────────────────────────────────────────

  const validate = (): boolean => {
    const errors: Partial<Record<string, string>> = {};
    if (!form.username.trim()) errors.username = 'Username bắt buộc';
    if (!editingUser && !form.password) errors.password = 'Password bắt buộc';
    if (!editingUser && form.password && form.password.length < 6) errors.password = 'Ít nhất 6 ký tự';
    if (form.password && form.password.length < 6) errors.password = 'Ít nhất 6 ký tự';
    if (form.password && form.password !== form.confirmPassword) errors.confirmPassword = 'Không khớp với password';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save ────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        username: form.username.trim(),
        fullName: form.fullName.trim() || undefined,
        role: form.role,
        isActive: form.isActive,
        password: form.password || undefined,
        permissions: form.permissions,
        reportGroupIds: form.reportGroupIds,
      };

      if (editingUser) {
        await userApi.updateUser(editingUser.user.id, payload);
        success('Cập nhật người dùng thành công!');
      } else {
        await userApi.createUser({ ...payload, password: form.password });
        success('Tạo người dùng mới thành công!');
      }
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────

  const handleDelete = async (u: UserWithPermissions) => {
    if (!confirm(`Xóa user "${u.user.username}"?`)) return;
    setDeleting(u.user.id);
    try {
      await userApi.deleteUser(u.user.id);
      success('Đã xóa người dùng');
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setDeleting(null);
    }
  };

  // ── Reset password ─────────────────────────────────────────

  const handleResetPassword = async () => {
    if (!newPw || newPw.length < 6) {
      showError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    try {
      await userApi.resetPassword(resetPwUser!.user.id, newPw);
      success('Đặt lại mật khẩu thành công!');
      setShowResetPw(false);
      setResetPwUser(null);
      setNewPw('');
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    }
  };

  // ── Report groups ────────────────────────────────────────────

  const openNewGroupForm = () => {
    setEditingGroup(null);
    setNewGroupName('');
    setNewGroupIcon('📂');
    setShowGroupForm(true);
  };

  const openEditGroupForm = (g: ReportGroup) => {
    setEditingGroup(g);
    setNewGroupName(g.name);
    setNewGroupIcon(g.icon);
    setShowGroupForm(true);
  };

  const handleSaveGroup = async () => {
    if (!newGroupName.trim()) {
      showError('Tên nhóm bắt buộc');
      return;
    }
    setSavingGroup(true);
    try {
      if (editingGroup) {
        await userApi.updateReportGroup(editingGroup.id, { name: newGroupName.trim(), icon: newGroupIcon });
        success('Cập nhật nhóm thành công!');
      } else {
        await userApi.createReportGroup({ name: newGroupName.trim(), icon: newGroupIcon });
        success('Tạo nhóm mới thành công!');
      }
      setShowGroupForm(false);
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (g: ReportGroup) => {
    if (!confirm(`Xóa nhóm "${g.name}"?`)) return;
    try {
      await userApi.deleteReportGroup(g.id);
      success('Đã xóa nhóm');
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    }
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar groups={[]} onClose={() => navigate('/')} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-black text-slate-800">👤 Quản lý Người dùng</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tạo, sửa user và phân quyền hành động + nhóm báo cáo</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={openNewGroupForm} icon={<span>📁</span>}>
                Thêm nhóm
              </Button>
              <Button onClick={openNewForm} icon={<span>➕</span>}>
                Tạo người dùng
              </Button>
            </div>
          </div>

          {/* Report Groups */}
          {groups.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-600">📁 Nhóm báo cáo</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                    <span className="text-sm">{g.icon}</span>
                    <span className="text-xs font-semibold text-slate-600">{g.name}</span>
                    <button onClick={() => openEditGroupForm(g)} className="text-slate-400 hover:text-blue-500 ml-1 text-xs">✏️</button>
                    <button onClick={() => handleDeleteGroup(g)} className="text-slate-400 hover:text-red-500 text-xs">🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Users table */}
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
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Quyền hành động</th>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Nhóm được xem</th>
                      <th className="px-6 py-4 text-right text-[11px] font-black text-slate-500 uppercase">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map(u => (
                      <tr key={u.user.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                              <span className="text-blue-600 font-black text-sm">
                                {u.user.fullName?.charAt(0) || u.user.username.charAt(0)}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-slate-800">{u.user.fullName || '—'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">@{u.user.username}</code>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={u.user.role === 'admin' ? 'info' : 'default'}>
                            {u.user.role === 'admin' ? 'Quản trị' : 'Người dùng'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={u.user.isActive ? 'success' : 'danger'}>
                            {u.user.isActive ? 'Hoạt động' : 'Bị khóa'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {u.permissions?.canCreateReport && <Badge variant="success">+BC</Badge>}
                            {u.permissions?.canEditReport && <Badge variant="info">✏️BC</Badge>}
                            {u.permissions?.canDeleteReport && <Badge variant="danger">−BC</Badge>}
                            {u.permissions?.canCreateGroup && <Badge variant="success">+NH</Badge>}
                            {u.permissions?.canEditGroup && <Badge variant="info">✏️NH</Badge>}
                            {u.permissions?.canDeleteGroup && <Badge variant="danger">−NH</Badge>}
                            {(!u.permissions || (Object.values(u.permissions).every(v => !v))) && (
                              <span className="text-xs text-slate-400 italic">Không có</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {u.reportGroupIds.length === 0 && (
                              <span className="text-xs text-slate-400 italic">Không có</span>
                            )}
                            {u.reportGroupIds.map(gid => {
                              const g = groups.find(g => g.id === gid);
                              return g ? (
                                <span key={gid} className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-600">
                                  {g.icon} {g.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEditForm(u)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">✏️ Sửa</button>
                            <button onClick={() => { setResetPwUser(u); setShowResetPw(true); }} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">🔑</button>
                            <button onClick={() => handleDelete(u)} disabled={deleting === u.user.id} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50">
                              {deleting === u.user.id ? '...' : '🗑️'}
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

      {/* ─── Create/Edit User Modal ─── */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingUser ? `✏️ Cập nhật: ${editingUser.user.username}` : '➕ Tạo người dùng mới'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Hủy</Button>
            <Button loading={saving} onClick={handleSave}>{editingUser ? 'Lưu' : 'Tạo'}</Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Section 1: Tài khoản */}
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">1. Thông tin tài khoản</h3>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Username *" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} error={formErrors.username} placeholder="Tên đăng nhập" disabled={!!editingUser} />
              <Input label="Họ và tên" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Họ và tên đầy đủ" />
              <Input label="Mật khẩu *" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} error={formErrors.password} placeholder={editingUser ? 'Để trống = giữ nguyên' : 'Ít nhất 6 ký tự'} />
              <Input label="Xác nhận mật khẩu" type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} error={formErrors.confirmPassword} placeholder="Nhập lại mật khẩu" />
              <Select label="Vai trò" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))} options={[{ value: 'user', label: 'Người dùng' }, { value: 'admin', label: 'Quản trị viên' }]} />
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                  Tài khoản hoạt động
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Quyền quản trị */}
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">2. Quyền hành động quản trị</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'canCreateReport' as const, label: '➕ Thêm báo cáo' },
                { key: 'canEditReport' as const, label: '✏️ Sửa báo cáo' },
                { key: 'canDeleteReport' as const, label: '🗑️ Xóa báo cáo' },
                { key: 'canCreateGroup' as const, label: '📁 Thêm nhóm báo cáo' },
                { key: 'canEditGroup' as const, label: '✏️ Sửa nhóm báo cáo' },
                { key: 'canDeleteGroup' as const, label: '🗑️ Xóa nhóm báo cáo' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors">
                  <input type="checkbox" checked={form.permissions[key]} onChange={e => setPerm(key, e.target.checked)} className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm font-medium text-slate-600">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 3: Nhóm báo cáo */}
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">3. Nhóm báo cáo được xem</h3>
            {groups.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa có nhóm báo cáo nào.</p>
            ) : (
              <>
                <div className="flex gap-2 mb-2">
                  <button onClick={selectAllGroups} className="text-xs text-blue-600 font-semibold hover:underline">Chọn tất cả</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={deselectAllGroups} className="text-xs text-slate-500 font-semibold hover:underline">Bỏ chọn tất cả</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {groups.map(g => (
                    <label key={g.id} className={`flex items-center gap-2 border rounded-xl px-3 py-2 cursor-pointer transition-colors ${form.reportGroupIds.includes(g.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={form.reportGroupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} className="w-4 h-4 accent-blue-600" />
                      <span className="text-sm">{g.icon}</span>
                      <span className="text-sm font-medium text-slate-600">{g.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* ─── Reset Password Modal ─── */}
      <Modal
        isOpen={showResetPw}
        onClose={() => { setShowResetPw(false); setResetPwUser(null); setNewPw(''); }}
        title={`🔑 Đặt lại mật khẩu: ${resetPwUser?.user.username}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowResetPw(false); setResetPwUser(null); }}>Hủy</Button>
            <Button onClick={handleResetPassword}>Lưu mật khẩu</Button>
          </>
        }
      >
        <Input label="Mật khẩu mới" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Ít nhất 6 ký tự" />
      </Modal>

      {/* ─── Report Group Modal ─── */}
      <Modal
        isOpen={showGroupForm}
        onClose={() => setShowGroupForm(false)}
        title={editingGroup ? `✏️ Sửa nhóm: ${editingGroup.name}` : '📁 Tạo nhóm báo cáo mới'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowGroupForm(false)}>Hủy</Button>
            <Button loading={savingGroup} onClick={handleSaveGroup}>{editingGroup ? 'Lưu' : 'Tạo'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Tên nhóm *" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="VD: Báo cáo tài chính" />
          <Input label="Biểu tượng" value={newGroupIcon} onChange={e => setNewGroupIcon(e.target.value)} placeholder="📂" />
          <div className="flex flex-wrap gap-1">
            {['📂', '💰', '🏥', '💊', '🧪', '🏗️', '👥', '📦', '📊', '📈', '🩺', '💉'].map(icon => (
              <button key={icon} onClick={() => setNewGroupIcon(icon)} className={`px-2 py-1 text-lg rounded-lg border transition-colors ${newGroupIcon === icon ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>{icon}</button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};
