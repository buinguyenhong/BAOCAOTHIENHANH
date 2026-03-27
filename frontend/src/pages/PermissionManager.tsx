import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { userApi } from '../api/user.api';
import { adminReportApi } from '../api/report.api';
import type { User, Report, ReportPermission } from '../types';

export const PermissionManager: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [permissions, setPermissions] = useState<Map<string, Map<string, { canView: boolean; canExport: boolean }>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, reportsRes] = await Promise.all([
        userApi.getAllUsers(),
        adminReportApi.getAllReports(),
      ]);

      if (usersRes.success && usersRes.data) setUsers(usersRes.data);
      if (reportsRes.success && reportsRes.data) setReports(reportsRes.data);

      // Fetch permissions for each user
      if (usersRes.data) {
        const permMap = new Map<string, Map<string, { canView: boolean; canExport: boolean }>>();
        for (const user of usersRes.data) {
          const res = await userApi.getPermissions(user.id);
          const userPermMap = new Map<string, { canView: boolean; canExport: boolean }>();
          if (res.success && res.data) {
            res.data.forEach((p: ReportPermission) => {
              userPermMap.set(p.reportId, { canView: !!p.canView, canExport: !!p.canExport });
            });
          }
          permMap.set(user.id, userPermMap);
        }
        setPermissions(permMap);
      }
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePermission = (userId: string, reportId: string, field: 'canView' | 'canExport') => {
    setPermissions((prev) => {
      const newMap = new Map(prev);
      const userPerms = new Map(newMap.get(userId) || new Map());
      const current = userPerms.get(reportId) || { canView: false, canExport: false };
      userPerms.set(reportId, { ...current, [field]: !current[field] });
      newMap.set(userId, userPerms);
      return newMap;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [userId, userPerms] of permissions.entries()) {
        const perms = Array.from(userPerms.entries()).map(([reportId, p]) => ({
          reportId,
          canView: p.canView,
          canExport: p.canExport,
        }));
        await userApi.setPermissions(userId, perms);
      }
      success('Lưu phân quyền thành công!');
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const getPermission = (userId: string, reportId: string): { canView: boolean; canExport: boolean } => {
    return permissions.get(userId)?.get(reportId) || { canView: false, canExport: false };
  };

  const getUserReportCount = (userId: string): number => {
    const userPerms = permissions.get(userId);
    if (!userPerms) return 0;
    let count = 0;
    userPerms.forEach((p) => { if (p.canView) count++; });
    return count;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar groups={[]} onClose={() => navigate('/')} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-black text-slate-800">🔐 Phân quyền Báo cáo</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Thiết lập quyền xem và xuất báo cáo cho từng người dùng
              </p>
            </div>
            <Button loading={saving} onClick={handleSave} icon={<span>💾</span>}>
              Lưu phân quyền
            </Button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-auto flex-1">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-4 text-left text-[11px] font-black text-slate-500 uppercase sticky left-0 bg-slate-50 z-20 min-w-[180px]">
                        Người dùng
                      </th>
                      {reports.map((r) => (
                        <th
                          key={r.id}
                          className="px-3 py-4 text-center text-[10px] font-black text-slate-500 uppercase whitespace-nowrap min-w-[100px]"
                          title={r.spName}
                        >
                          <div className="text-base mb-0.5">{r.groupIcon}</div>
                          <div className="max-w-[80px] truncate">{r.name}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-4 py-4 sticky left-0 bg-white z-10">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-blue-600 font-black text-xs">
                                {user.fullName?.charAt(0) || user.username.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{user.fullName || user.username}</p>
                              <p className="text-[10px] text-slate-400">
                                {user.role === 'admin' ? 'Quản trị' : 'Người dùng'}
                                {user.role !== 'admin' && (
                                  <span className="ml-2 text-blue-500 font-medium">
                                    ({getUserReportCount(user.id)} báo cáo)
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        {reports.map((report) => {
                          const perm = getPermission(user.id, report.id);
                          const isAdmin = user.role === 'admin';
                          return (
                            <td key={report.id} className="px-3 py-4 text-center">
                              {isAdmin ? (
                                <span className="text-xs text-slate-300 italic">Tất cả</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={perm.canView}
                                    onChange={() => togglePermission(user.id, report.id, 'canView')}
                                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                                    title="Quyền xem"
                                  />
                                  <input
                                    type="checkbox"
                                    checked={perm.canExport}
                                    onChange={() => togglePermission(user.id, report.id, 'canExport')}
                                    disabled={!perm.canView}
                                    className="w-4 h-4 accent-emerald-600 cursor-pointer disabled:opacity-30"
                                    title="Quyền xuất"
                                  />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center gap-6 shrink-0">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <input type="checkbox" checked disabled className="w-3 h-3 accent-blue-600" /> Xem báo cáo
                </span>
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <input type="checkbox" checked disabled className="w-3 h-3 accent-emerald-600" /> Xuất Excel
                </span>
                <span className="text-xs text-slate-400 font-medium">· Admin luôn có quyền tất cả</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
