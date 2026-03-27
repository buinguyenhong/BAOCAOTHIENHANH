import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReportGroup } from '../types';

interface SidebarProps {
  groups: ReportGroup[];
  onSelectReport?: (reportId: string) => void;
  onClose?: () => void;
  activeReportId?: string;
}

const getGroupIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('doanh thu') || lower.includes('tài chính')) return '💰';
  if (lower.includes('bệnh nhân') || lower.includes('khám bệnh')) return '🏥';
  if (lower.includes('dược') || lower.includes('thuốc')) return '💊';
  if (lower.includes('xét nghiệm') || lower.includes('lab')) return '🧪';
  if (lower.includes('khoa') || lower.includes('phòng')) return '🏗️';
  if (lower.includes('nhân sự')) return '👥';
  if (lower.includes('vật tư')) return '📦';
  return '📂';
};

export const Sidebar: React.FC<SidebarProps> = ({
  groups,
  onSelectReport,
  onClose,
  activeReportId,
}) => {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGroups = groups.map((group) => ({
    ...group,
    reports: group.reports.filter((r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter((group) => group.reports.length > 0);

  const navItems = [
    {
      to: '/',
      icon: '📊',
      label: 'Báo cáo',
      adminOnly: false,
    },
    ...(isAdmin ? [
      {
        to: '/design',
        icon: '🎨',
        label: 'Thiết kế báo cáo',
        adminOnly: true,
      },
      {
        to: '/users',
        icon: '👤',
        label: 'Quản lý người dùng',
        adminOnly: true,
      },
      {
        to: '/permissions',
        icon: '🔐',
        label: 'Phân quyền',
        adminOnly: true,
      },
      {
        to: '/system',
        icon: '⚙️',
        label: 'Cấu hình hệ thống',
        adminOnly: true,
      },
    ] : []),
  ];

  return (
    <aside className="w-80 bg-white border-r border-slate-200 flex flex-col h-full z-30 shrink-0">
      {/* Navigation */}
      <nav className="p-4 border-b border-slate-100">
        <div className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                location.pathname === item.to
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Reports list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 pb-2">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
            Báo cáo của tôi
          </h3>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm báo cáo..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all pl-9"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm">🔍</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-slate-400">
                {searchTerm ? 'Không tìm thấy báo cáo' : 'Chưa có báo cáo được gán'}
              </p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.id} className="mb-5">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-3 flex items-center gap-2">
                  <span>{getGroupIcon(group.name)}</span>
                  {group.name}
                </h4>
                <div className="space-y-0.5">
                  {group.reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => {
                        onSelectReport?.(report.id);
                        onClose?.();
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 group ${
                        activeReportId === report.id
                          ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        activeReportId === report.id ? 'bg-blue-600' : 'bg-slate-300 group-hover:bg-slate-400'
                      }`} />
                      <span className="truncate">{report.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100">
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Hệ thống HIS
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            {isAdmin ? 'Quản trị viên' : 'Người dùng'} · {new Date().toLocaleDateString('vi-VN')}
          </p>
        </div>
      </div>
    </aside>
  );
};
