import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Card';
import { useToast } from '../contexts/ToastContext';
import { userApi } from '../api/user.api';
import type { UserWithPermissions, ReportGroup } from '../types';

export const PermissionManager: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  /** Map: userId → Set<groupId> */
  const [groupPerms, setGroupPerms] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, groupsRes] = await Promise.all([
        userApi.getAllUsers(),
        userApi.getReportGroups(),
      ]);
      if (usersRes.success && usersRes.data) setUsers(usersRes.data);
      if (groupsRes.success && groupsRes.data) {
        setGroups(groupsRes.data);

        // Build groupPerms map from existing data
        const map = new Map<string, Set<string>>();
        if (usersRes.data) {
          for (const u of usersRes.data) {
            map.set(u.user.id, new Set(u.reportGroupIds || []));
          }
        }
        setGroupPerms(map);
      }
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, []);

  const toggleGroup = (userId: string, groupId: string) => {
    setGroupPerms(prev => {
      const next = new Map(prev);
      const userSet = new Set(next.get(userId) || []);
      if (userSet.has(groupId)) {
        userSet.delete(groupId);
      } else {
        userSet.add(groupId);
      }
      next.set(userId, userSet);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [userId, groupSet] of groupPerms.entries()) {
        await userApi.updateUser(userId, { reportGroupIds: Array.from(groupSet) });
      }
      success('Lưu phân quyền nhóm báo cáo thành công!');
      fetchData();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasGroup = (userId: string, groupId: string): boolean => {
    return groupPerms.get(userId)?.has(groupId) ?? false;
  };

  const countGroups = (userId: string): number => {
    return groupPerms.get(userId)?.size ?? 0;
  };

  const groupIconMap: Record<string, string> = {};
  groups.forEach(g => { groupIconMap[g.id] = g.icon; });

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar groups={[]} onClose={() => navigate('/')} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-black text-slate-800">🔐 Phân quyền Nhóm Báo cáo</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Gán nhóm báo cáo mà người dùng được phép xem. User đăng nhập chỉ thấy báo cáo trong nhóm được cấp.
              </p>
            </div>
            <Button loading={saving} onClick={handleSave} icon={<span>💾</span>}>
              Lưu phân quyền
            </Button>
          </div>

          {/* Matrix */}
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
                      <th className="px-4 py-4 text-left text-[11px] font-black text-slate-500 uppercase sticky left-0 bg-slate-50 z-20 min-w-[200px]">
                        Người dùng
                      </th>
                      {groups.map(g => (
                        <th
                          key={g.id}
                          className="px-4 py-4 text-center text-xs font-black text-slate-500 uppercase whitespace-nowrap min-w-[120px]"
                        >
                          <div className="text-xl mb-1">{g.icon}</div>
                          <div className="max-w-[100px] truncate text-[11px]">{g.name}</div>
                        </th>
                      ))}
                      <th className="px-4 py-4 text-center text-[11px] font-black text-slate-500 uppercase min-w-[80px]">
                        Được xem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map(u => (
                      <tr key={u.user.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-4 py-4 sticky left-0 bg-white z-10">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-blue-600 font-black text-xs">
                                {u.user.fullName?.charAt(0) || u.user.username.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{u.user.fullName || u.user.username}</p>
                              <p className="text-[10px] text-slate-400">
                                {u.user.role === 'admin' ? 'Quản trị' : 'Người dùng'}
                                {u.user.role !== 'admin' && (
                                  <span className="ml-2 text-blue-500 font-medium">({countGroups(u.user.id)} nhóm)</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        {groups.map(g => {
                          const isAdmin = u.user.role === 'admin';
                          const allowed = hasGroup(u.user.id, g.id);
                          return (
                            <td key={g.id} className="px-4 py-4 text-center">
                              {isAdmin ? (
                                <span className="text-xs text-slate-300 italic">Luôn được</span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={allowed}
                                  onChange={() => toggleGroup(u.user.id, g.id)}
                                  className="w-5 h-5 accent-blue-600 cursor-pointer rounded"
                                />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-4 text-center">
                          {u.user.role === 'admin' ? (
                            <Badge variant="info">Tất cả</Badge>
                          ) : (
                            <Badge variant={countGroups(u.user.id) > 0 ? 'success' : 'danger'}>
                              {countGroups(u.user.id)} nhóm
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center gap-6 shrink-0">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <input type="checkbox" checked disabled className="w-3 h-3 accent-blue-600" /> Admin: luôn thấy tất cả
                </span>
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <input type="checkbox" checked disabled className="w-3 h-3 accent-blue-600" /> User: tích chọn nhóm được xem
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
