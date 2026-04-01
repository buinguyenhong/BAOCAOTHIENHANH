import React from 'react';
import { Spinner } from './ui/Card';

interface DataTableProps {
  columns: string[];
  rows: Record<string, any>[];
  loading?: boolean;
  emptyText?: string;
}

// ─────────────────────────────────────────────
// Date detection & formatting
// ─────────────────────────────────────────────

/** Excel serial number → "dd/MM/yyyy" or "dd/MM/yyyy HH:mm:ss" */
function excelSerialToString(serial: number, includeTime = false): string {
  // Excel epoch = 30/12/1899 (UTC to avoid timezone shift)
  const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
  const ms = serial * 86400 * 1000;
  const d = new Date(EXCEL_EPOCH_MS + ms);

  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();

  if (includeTime) {
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
  }
  return `${day}/${month}/${year}`;
}

/** True if a number looks like an Excel date serial (>= 25569 = 1970-01-01, reasonable range) */
function isExcelSerial(n: number): boolean {
  // 25569 = 1970-01-01, 109205 = 2099-12-31 — filter out plain numbers
  return n >= 25569 && n <= 109205;
}

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  rows,
  loading,
  emptyText = 'Không có dữ liệu',
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-slate-400 font-medium">Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 gap-3">
        <div className="text-5xl opacity-20">📭</div>
        <p className="text-sm font-medium text-slate-400">{emptyText}</p>
      </div>
    );
  }

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
      // Excel serial date range: 25569 (1970-01-01) → 109205 (2099-12-31)
      if (isExcelSerial(value)) {
        return excelSerialToString(value, value % 1 !== 0);
      }
      return value.toLocaleString('vi-VN');
    }
    if (typeof value === 'boolean') {
      return value ? 'Có' : 'Không';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  return (
    <div className="w-full h-full overflow-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/80 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest w-14 border-r border-slate-100 sticky left-0 bg-slate-50/80 z-20">
              STT
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="px-5 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-50">
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className="group hover:bg-blue-50/20 transition-colors"
            >
              <td className="px-4 py-4 text-center text-xs font-bold text-slate-300 group-hover:text-blue-400 border-r border-slate-100 sticky left-0 bg-white group-hover:bg-blue-50/20 z-10">
                {idx + 1}
              </td>
              {columns.map((col) => (
                <td
                  key={col}
                  className="px-5 py-4 whitespace-nowrap text-[13px] text-slate-600 font-medium"
                >
                  {formatValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer summary */}
      <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between sticky bottom-0">
        <p className="text-xs text-slate-400 font-medium">
          Hiển thị <span className="font-bold text-slate-600">{rows.length}</span> dòng dữ liệu
        </p>
        <p className="text-xs text-slate-400 font-medium">
          <span className="font-bold text-slate-600">{columns.length}</span> cột
        </p>
      </div>
    </div>
  );
};
