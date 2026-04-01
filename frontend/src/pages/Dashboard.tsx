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
  const { reports, reportGroups, loading: reportsLoading, fetchMyReports, executeReport, exportReport, fetchParamOptions } = useReports();
  const { success, error: showError } = useToast();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [result, setResult] = useState<QueryResult | null>(null);
  const [selectedRecordsetIndex, setSelectedRecordsetIndex] = useState(0);

  // Current recordset data (based on selected tab)
  const allRecordsets = result?.recordsets ?? (result?.rows ? [result.rows] : []);
  const currentRs = allRecordsets[selectedRecordsetIndex] ?? [];
  const currentColumns = currentRs.length > 0 ? Object.keys(currentRs[0]) : [];
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
      setSelectedRecordsetIndex(0);
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
    if (!selectedReport || allRecordsets.length === 0) {
      showError('Không có dữ liệu để xuất');
      return;
    }

    setExporting(true);
    try {
      const fileName = `${selectedReport.name.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportReport(selectedReport.id, { recordsets: allRecordsets }, paramValues, fileName);
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
                  {allRecordsets.length > 0 && (
                    <span className="text-xs text-slate-400 font-medium bg-slate-100 px-3 py-1.5 rounded-lg">
                      {allRecordsets.length > 1 ? `${allRecordsets.length} result sets · ` : ''}
                      {currentRs.length} dòng
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
                  {allRecordsets.length > 0 && (
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
                    fetchOptions={(param) => fetchParamOptions(selectedReport.id, param)}
                  />
                </div>
              )}

              {/* Data Tables — one per recordset */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-4">
                {allRecordsets.map((rs, idx) => {
                  const cols = rs.length > 0 ? Object.keys(rs[0]) : [];
                  const isActive = idx === selectedRecordsetIndex;
                  return (
                    <div
                      key={idx}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col min-h-[200px] ${isActive ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200 opacity-60'}`}
                    >
                      {/* Recordset tab bar */}
                      {allRecordsets.length > 1 && (
                        <div className="flex items-center border-b border-slate-200 px-4 pt-3 pb-0 shrink-0">
                          <button
                            onClick={() => setSelectedRecordsetIndex(idx)}
                            className={`px-3 py-2 text-xs font-semibold rounded-t-lg border border-transparent -mb-px transition-colors ${isActive ? 'bg-white border-b-white text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            Result {idx + 1} · {rs.length} dòng
                          </button>
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <DataTable
                          columns={cols}
                          rows={rs}
                          loading={executing}
                          emptyText="Không có dữ liệu"
                          recordsetMetadata={result?.recordsetMetadata}
                          recordsetIndex={idx}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Empty state */}
                {allRecordsets.length === 0 && !executing && (
                  <div className="flex-1 flex items-center justify-center">
                    <EmptyState
                      icon="📋"
                      title="Chưa có dữ liệu"
                      description="Nhấn 'Chạy báo cáo' để xem dữ liệu"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
