import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { DataTable } from '../components/DataTable';
import { ParameterForm } from '../components/ParameterForm';
import { Button } from '../components/ui/Button';
import { Spinner, EmptyState } from '../components/ui/Card';
import { useReports } from '../hooks/useReports';
import { reportApi } from '../api/report.api';
import { useToast } from '../contexts/ToastContext';
import type { Report, QueryResult } from '../types';

export const Dashboard: React.FC = () => {
  const { reports, reportGroups, loading: reportsLoading, fetchMyReports, executeReport, exportReport } = useReports();
  const { success, error: showError } = useToast();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [result, setResult] = useState<QueryResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch reports on mount
  useEffect(() => {
    fetchMyReports();
  }, [fetchMyReports]);

  // Update param values when report changes
  useEffect(() => {
    if (selectedReport) {
      const defaults: Record<string, any> = {};
      selectedReport.parameters?.forEach((p) => {
        defaults[p.paramName] = p.defaultValue || '';
      });
      setParamValues(defaults);
      setResult(null);
    }
  }, [selectedReport]);

  const handleSelectReport = useCallback((reportId: string) => {
    const report = reports.find((r) => r.id === reportId);
    setSelectedReport(report || null);
    setResult(null);
  }, [reports]);

  const handleRunReport = async () => {
    if (!selectedReport) return;
    setExecuting(true);
    setResult(null);

    try {
      const res = await executeReport(selectedReport.id, paramValues);
      if (res) {
        setResult(res);
      }
    } catch (err: any) {
      showError(err.message || 'Lỗi thực thi báo cáo');
    } finally {
      setExecuting(false);
    }
  };

  const handleExport = async () => {
    if (!selectedReport || !result || result.rows.length === 0) {
      showError('Không có dữ liệu để xuất');
      return;
    }

    setExporting(true);
    try {
      const fileName = `${selectedReport.name.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportReport(selectedReport.id, { recordsets: result.recordsets || [result.rows] }, paramValues, fileName);
      success(`Đã xuất ${fileName}`);
    } catch (err: any) {
      showError(err.message || 'Lỗi xuất file');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed lg:relative z-30 h-full transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Sidebar
          groups={reportGroups}
          onSelectReport={handleSelectReport}
          onClose={() => setSidebarOpen(false)}
          activeReportId={selectedReport?.id}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
          {!selectedReport ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="📊"
                title="Chọn báo cáo để bắt đầu"
                description="Chọn báo cáo từ danh sách bên trái để xem dữ liệu"
              />
            </div>
          ) : (
            <>
              {/* Report header */}
              <div className="flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xl font-black text-slate-800">{selectedReport.name}</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    SP: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{selectedReport.spName}</span>
                    {selectedReport.description && (
                      <span className="ml-3 text-slate-400 italic">· {selectedReport.description}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {result && result.rows.length > 0 && (
                    <span className="text-xs text-slate-400 font-medium bg-slate-100 px-3 py-1.5 rounded-lg">
                      {result.rows.length} dòng
                    </span>
                  )}
                  <Button
                    onClick={handleRunReport}
                    loading={executing}
                    disabled={executing}
                    icon={<span>🚀</span>}
                  >
                    {executing ? 'Đang chạy...' : 'Chạy báo cáo'}
                  </Button>
                  {result && result.rows.length > 0 && (
                    <Button
                      onClick={handleExport}
                      loading={exporting}
                      variant="primary"
                      icon={<span>📥</span>}
                    >
                      Xuất Excel
                    </Button>
                  )}
                </div>
              </div>

              {/* Parameters */}
              {selectedReport.parameters && selectedReport.parameters.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 shrink-0">
                  <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4">
                    Tham số báo cáo
                  </h3>
                  <ParameterForm
                    parameters={selectedReport.parameters}
                    values={paramValues}
                    onChange={(name, value) => setParamValues((prev) => ({ ...prev, [name]: value }))}
                  />
                </div>
              )}

              {/* Data Table */}
              <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
                <DataTable
                  columns={result?.columns || []}
                  rows={result?.rows || []}
                  loading={executing}
                  emptyText="Nhấn 'Chạy báo cáo' để xem dữ liệu"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
