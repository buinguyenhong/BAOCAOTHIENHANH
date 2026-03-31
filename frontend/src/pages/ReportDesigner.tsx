import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Badge } from '../components/ui/Card';
import { useToast } from '../contexts/ToastContext';
import { adminReportApi, systemApi } from '../api/report.api';
import type { Report, ReportGroupView, SPMetadata, CreateReportDto, CreateParamDto, CreateMappingDto, ReportParameter, ReportMapping, TestRunResult } from '../types';

const DEFAULT_GROUPS = [
  { value: 'Tổng hợp', label: '📂 Tổng hợp' },
  { value: 'Bệnh nhân', label: '🏥 Bệnh nhân' },
  { value: 'Tài chính', label: '💰 Tài chính' },
  { value: 'Dược', label: '💊 Dược' },
  { value: 'Xét nghiệm', label: '🧪 Xét nghiệm' },
  { value: 'Khoa Phòng', label: '🏗️ Khoa Phòng' },
  { value: 'Nhân sự', label: '👥 Nhân sự' },
];

export const ReportDesigner: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  // State
  const [reports, setReports] = useState<Report[]>([]);
  const [groups, setGroups] = useState<ReportGroupView[]>([]);
  const [loading, setLoading] = useState(true);
  const [spList, setSpList] = useState<string[]>([]);
  const [spLoading, setSpLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'params' | 'mapping' | 'template'>('info');

  // Form data
  const [formName, setFormName] = useState('');
  const [formGroup, setFormGroup] = useState('Tổng hợp');
  const [formIcon, setFormIcon] = useState('📂');
  const [formSpName, setFormSpName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formParams, setFormParams] = useState<CreateParamDto[]>([]);
  const [formMappings, setFormMappings] = useState<CreateMappingDto[]>([]);
  const [allResultSetMappings, setAllResultSetMappings] = useState<Record<number, CreateMappingDto[]>>({});
  const [spMetadata, setSpMetadata] = useState<SPMetadata | null>(null);
  const [formTemplateFile, setFormTemplateFile] = useState<string>('');
  const [templatePreview, setTemplatePreview] = useState<string>('');
  const [testRunResult, setTestRunResult] = useState<TestRunResult | null>(null);
  const [selectedResultSet, setSelectedResultSet] = useState(0);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testRunError, setTestRunError] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminReportApi.getAllReports();
      if (res.success && res.data) {
        setReports(res.data);
        const map = new Map<string, Report[]>();
        res.data.forEach((r) => {
          const key = r.groupName || 'Khác';
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(r);
        });
        setGroups(
          Array.from(map.entries()).map(([name, reports]) => ({
            id: name.toLowerCase().replace(/\s+/g, '-'),
            name,
            icon: reports[0]?.groupIcon || '📂',
            reports,
          }))
        );
      }
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSPs = useCallback(async () => {
    setSpLoading(true);
    try {
      const res = await systemApi.getStoredProcedures();
      if (res.success && res.data) {
        setSpList(res.data.map((s) => s.name));
      }
    } catch {
      // Ignore if HospitalDB not configured
    } finally {
      setSpLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchSPs();
  }, [fetchReports, fetchSPs]);

  // Load SP metadata when SP changes
  useEffect(() => {
    if (formSpName) {
      systemApi.getSPMetadata(formSpName).then((res) => {
        if (res.success && res.data) {
          setSpMetadata(res.data);

          // Auto-generate params from SP parameters
          if (!editingReport || (editingReport && editingReport.spName !== formSpName)) {
            const autoParams: CreateParamDto[] = res.data.parameters.map((p, idx) => ({
              paramName: p.name,
              paramLabel: p.name.replace(/^@/, '').replace(/([A-Z])/g, ' $1').trim(),
              paramType: inferParamType(p.type, p.name),
              isRequired: !p.hasDefaultValue && p.isNullable === false,
              displayOrder: idx + 1,
              options: undefined,
            }));
            setFormParams(autoParams);
          }

          // Auto-generate mappings from SP columns
          if (!editingReport || (editingReport && editingReport.spName !== formSpName)) {
            const autoMappings: CreateMappingDto[] = res.data.columns.map((col, idx) => ({
              fieldName: col.name,
              cellAddress: `A${10 + idx}`,
              mappingType: 'list',
              displayOrder: idx + 1,
            }));
            setFormMappings(autoMappings);
          }
        }
      }).catch(() => {
        setSpMetadata(null);
        if (!editingReport) {
          setFormParams([]);
          setFormMappings([]);
        }
      });
    }
  }, [formSpName, editingReport]);

  const inferParamType = (sqlType: string, paramName: string): 'text' | 'date' | 'number' | 'select' => {
    const lower = paramName.toLowerCase();
    const upper = sqlType.toUpperCase();

    if (lower.includes('ngay') || lower.includes('date') || lower.includes('tungay') || lower.includes('denngay')) return 'date';
    if (upper.includes('INT') || upper.includes('DECIMAL') || upper.includes('FLOAT') || upper.includes('NUMERIC')) return 'number';
    return 'text';
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Chạy thử SP - lấy columns + sample rows + params từ backend
  const handleTestRun = async () => {
    if (!formSpName) return;
    setTestRunning(true);
    setTestRunError('');
    setTestRunResult(null);
    setSelectedResultSet(0); // reset về result set đầu tiên
    try {
      // Lấy params từ form (chỉ gửi params có giá trị)
      const params: Record<string, any> = {};
      for (const p of formParams) {
        if (p.paramName && p.defaultValue !== undefined && p.defaultValue !== null && p.defaultValue !== '') {
          params[p.paramName] = p.defaultValue;
        }
      }

      const res = await systemApi.testRun(formSpName, params);
      if (res.success && res.data) {
        const result: TestRunResult = {
          columns: res.data.columns,
          rows: res.data.rows,
          params: res.data.params || [],
          recordsets: res.data.recordsets || [res.data.rows],
        };
        setTestRunResult(result);
        setSelectedResultSet(0); // reset về result set đầu tiên

        // Auto-generate mappings cho TẤT CẢ result sets
        const allMappings: Record<number, CreateMappingDto[]> = {};
        result.recordsets.forEach((rs, rsIdx) => {
          if (rs.length === 0) { allMappings[rsIdx] = []; return; }
          const cols = Object.keys(rs[0]);
          if (cols.length === 0) { allMappings[rsIdx] = []; return; }
          allMappings[rsIdx] = cols.map((col: string, idx: number) => ({
            fieldName: col,
            cellAddress: `A${10 + idx}`,
            mappingType: 'list' as const,
            displayOrder: idx + 1,
            sheetName: availableSheets[0] || undefined,
            resultSetIndex: rsIdx, // Lưu index của result set
          }));
        });
        setAllResultSetMappings(allMappings);
        setFormMappings(allMappings[0] || []);
      } else {
        setTestRunError(res.error || 'Không có kết quả');
      }
    } catch (err: any) {
      setTestRunError(err.response?.data?.error || err.message);
    } finally {
      setTestRunning(false);
    }
  };

  const openNewForm = () => {
    setEditingReport(null);
    setFormName('');
    setFormGroup('Tổng hợp');
    setFormIcon('📂');
    setFormSpName('');
    setFormDesc('');
    setFormParams([]);
    setFormMappings([]);
    setAllResultSetMappings({});
    setSpMetadata(null);
    setFormTemplateFile('');
    setTemplatePreview('');
    setTestRunResult(null);
    setTestRunError('');
    setSelectedResultSet(0);
    setAvailableSheets([]);
    setActiveTab('info');
    setShowForm(true);
  };

  const openEditForm = async (report: Report) => {
    setEditingReport(report);
    setFormName(report.name);
    setFormGroup(report.groupName || 'Tổng hợp');
    setFormIcon(report.groupIcon || '📂');
    setFormSpName(report.spName);
    setFormDesc(report.description || '');
    setFormParams(
      (report.parameters || []).map((p) => ({
        paramName: p.paramName,
        paramLabel: p.paramLabel || p.paramName,
        paramType: p.paramType,
        defaultValue: p.defaultValue || '',
        isRequired: p.isRequired,
        displayOrder: p.displayOrder,
        options: p.options || [],
      }))
    );

    // Build allResultSetMappings from saved mappings, grouping by resultSetIndex
    const loadedMappings = (report.mappings || []).map((m) => ({
      fieldName: m.fieldName,
      cellAddress: m.cellAddress || '',
      mappingType: m.mappingType,
      displayOrder: m.displayOrder,
      sheetName: m.sheetName || undefined,
      resultSetIndex: (m as any).resultSetIndex ?? 0,
    }));

    const grouped: Record<number, CreateMappingDto[]> = {};
    loadedMappings.forEach((m) => {
      const idx = m.resultSetIndex ?? 0;
      if (!grouped[idx]) grouped[idx] = [];
      grouped[idx].push(m);
    });

    setAllResultSetMappings(grouped);
    // Show mappings from result set 0 (or first available)
    const firstRsIdx = Object.keys(grouped).map(Number).sort((a, b) => a - b)[0] ?? 0;
    setFormMappings(grouped[firstRsIdx] || []);
    setSelectedResultSet(firstRsIdx);

    setFormTemplateFile(report.templateFile || '');
    setTemplatePreview('');
    setTestRunResult(null);
    setTestRunError('');
    setActiveTab('info');
    setShowForm(true);

    // Load available sheets from template file
    if (report.templateFile) {
      try {
        const res = await adminReportApi.getTemplateSheets(report.id);
        if (res.success && res.data) {
          setAvailableSheets(res.data);
        } else {
          setAvailableSheets([]);
        }
      } catch {
        setAvailableSheets([]);
      }
    } else {
      setAvailableSheets([]);
    }
  };

  const handleSave = async () => {
    if (!formName || !formSpName) {
      showError('Tên báo cáo và Stored Procedure là bắt buộc');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: formName,
        groupName: formGroup,
        groupIcon: formIcon,
        spName: formSpName,
        description: formDesc,
        parameters: formParams.filter((p) => p.paramName),
        // Merge all result set mappings
        mappings: Object.values(allResultSetMappings).flat().filter((m) => m.fieldName),
      };

      // Upload template if selected
      if (formTemplateFile && templatePreview) {
        payload.templateFile = formTemplateFile;
        payload.templateData = templatePreview;
      }

      if (editingReport) {
        await adminReportApi.updateReport(editingReport.id, payload);
        success('Cập nhật báo cáo thành công!');
      } else {
        await adminReportApi.createReport(payload);
        success('Tạo báo cáo mới thành công!');
      }

      setShowForm(false);
      fetchReports();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message || 'Lỗi lưu báo cáo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Xóa báo cáo "${name}"?`)) return;
    setDeleting(id);
    try {
      await adminReportApi.deleteReport(id);
      success('Đã xóa báo cáo');
      fetchReports();
    } catch (err: any) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setDeleting(null);
    }
  };

  const updateParam = (idx: number, updates: Partial<CreateParamDto>) => {
    setFormParams((prev) => prev.map((p, i) => (i === idx ? { ...p, ...updates } : p)));
  };

  const updateMapping = (idx: number, updates: Partial<CreateMappingDto>) => {
    // Cập nhật formMappings (mapping đang hiển thị)
    setFormMappings((prev) => prev.map((m, i) => (i === idx ? { ...m, ...updates } : m)));
    // Cập nhật allResultSetMappings tương ứng
    const rsIdx = selectedResultSet;
    setAllResultSetMappings((prev) => {
      const updated = { ...prev };
      if (updated[rsIdx]) {
        updated[rsIdx] = updated[rsIdx].map((m, i) => (i === idx ? { ...m, ...updates } : m));
      }
      return updated;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar groups={groups} onClose={() => navigate('/')} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-black text-slate-800">🎨 Thiết kế Báo cáo</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tạo và quản lý cấu hình báo cáo</p>
            </div>
            <Button onClick={openNewForm} icon={<span>➕</span>}>
              Tạo báo cáo mới
            </Button>
          </div>

          {/* Report list */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Đang tải...</p>
                </div>
              </div>
            ) : reports.length === 0 ? (
              <EmptyState
                icon="📋"
                title="Chưa có báo cáo nào"
                description="Nhấn 'Tạo báo cáo mới' để bắt đầu thiết kế"
              />
            ) : (
              <div className="overflow-auto h-full">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Tên báo cáo</th>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Nhóm</th>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Stored Procedure</th>
                      <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase">Tham số</th>
                      <th className="px-6 py-4 text-right text-[11px] font-black text-slate-500 uppercase">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.map((report) => (
                      <tr key={report.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-slate-800">{report.name}</p>
                          {report.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{report.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm">{report.groupIcon}</span>
                          <span className="text-xs text-slate-500 ml-1">{report.groupName}</span>
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">{report.spName}</code>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">
                            {(report.parameters || []).length} tham số · {(report.mappings || []).length} mapping
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditForm(report)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              ✏️ Sửa
                            </button>
                            <button
                              onClick={() => handleDelete(report.id, report.name)}
                              disabled={deleting === report.id}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              {deleting === report.id ? '...' : '🗑️'}
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

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingReport ? '✏️ Cập nhật báo cáo' : '➕ Tạo báo cáo mới'}
        size="full"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Hủy</Button>
            <Button loading={saving} onClick={handleSave}>
              {editingReport ? 'Lưu thay đổi' : 'Tạo báo cáo'}
            </Button>
          </>
        }
      >
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200 pb-4">
          {(['info', 'params', 'mapping', 'template'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {tab === 'info' ? '📋 Thông tin' :
               tab === 'params' ? `⚙️ Tham số (${formParams.length})` :
               tab === 'mapping' ? `📍 Mapping (${formMappings.length})` :
               formTemplateFile ? `📄 Template: ${formTemplateFile}` : '📄 Template'}
            </button>
          ))}
        </div>

        {/* Toolbar: Auto detect + Test run */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!formSpName) { showError('Chọn Stored Procedure trước'); return; }
              setSpLoading(true);
              try {
                const res = await systemApi.getSPMetadata(formSpName);
                if (res.success && res.data) {
                  setSpMetadata(res.data);
                  if (!editingReport || editingReport.spName !== formSpName) {
                    const autoParams: CreateParamDto[] = (res.data.parameters || []).map((p, idx) => ({
                      paramName: p.name,
                      paramLabel: p.name.replace(/^@/, '').replace(/([A-Z])/g, ' $1').trim(),
                      paramType: inferParamType(p.type || '', p.name),
                      isRequired: !p.hasDefaultValue,
                      displayOrder: idx + 1,
                      options: undefined,
                    }));
                    const autoMappings: CreateMappingDto[] = (res.data.columns || []).map((col, idx) => ({
                      fieldName: col.name,
                      cellAddress: `A${10 + idx}`,
                      mappingType: 'list',
                      displayOrder: idx + 1,
                      sheetName: availableSheets[0] || undefined,
                    }));
                    setFormParams(autoParams);
                    setFormMappings(autoMappings);
                    success('Đã tự động nhận diện tham số và mapping!');
                  }
                }
              } catch { showError('Không lấy được metadata SP'); }
              finally { setSpLoading(false); }
            }}
            icon={<span>🔍</span>}
          >
            Tự động detect
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleTestRun}
            loading={testRunning}
            icon={<span>▶️</span>}
          >
            Chạy thử
          </Button>

          {testRunResult && (
            <div className="ml-auto flex items-center gap-2 text-xs text-emerald-700 font-bold">
              <span>✅</span>
              <span>{testRunResult.columns.length} cột · {testRunResult.rows.length} dòng</span>
              {testRunResult.recordsets.length > 1 && (
                <select
                  value={selectedResultSet}
                  onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    setSelectedResultSet(idx);
                    // Cập nhật preview theo recordset đã chọn
                    const rs = testRunResult.recordsets[idx] || [];
                    const cols = rs.length > 0 ? Object.keys(rs[0]) : [];
                    setTestRunResult({ ...testRunResult, columns: cols, rows: rs });
                    // Chuyển sang mappings của recordset đã chọn
                    setFormMappings(allResultSetMappings[idx] || []);
                    success(`Đã chọn Result ${idx + 1}: ${rs.length} dòng`);
                  }}
                  className="ml-2 px-2 py-1 border border-emerald-300 rounded-lg text-xs"
                >
                  {testRunResult.recordsets.map((_rs: any[], idx: number) => (
                    <option key={idx} value={idx}>Result {idx + 1}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {testRunError && (
            <div className="ml-auto flex items-center gap-2 text-xs text-red-600 font-bold">
              <span>❌</span>
              <span>{testRunError}</span>
            </div>
          )}
        </div>

        {/* Test Run Preview */}
        {testRunResult && (
          <div className="mb-6 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl overflow-auto">
            <h4 className="text-sm font-black text-emerald-800 mb-3">
              📊 Kết quả chạy thử — Result {selectedResultSet + 1}: {testRunResult.rows.length} dòng
            </h4>
            {testRunResult.recordsets.length > 1 && (
              <p className="text-xs text-emerald-600 mb-2">
                ⚡ SP trả về {testRunResult.recordsets.length} resultsets. Dùng dropdown bên trên để chọn result set khác.
              </p>
            )}
            <div className="overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-emerald-100">
                  <tr>
                    {testRunResult.columns.map((col: string) => (
                      <th key={col} className="px-3 py-2 text-left font-black text-emerald-800 border border-emerald-200 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {testRunResult.rows.map((row: any, i: number) => (
                    <tr key={i} className="bg-white border border-emerald-200">
                      {testRunResult.columns.map((col: string) => (
                        <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-xs truncate">{String(row[col] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: Info */}
        {activeTab === 'info' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <Input
                label="Tên báo cáo *"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="VD: Báo cáo Doanh thu theo tháng"
              />
              <Select
                label="Nhóm báo cáo"
                value={formGroup}
                onChange={(e) => setFormGroup(e.target.value)}
                options={DEFAULT_GROUPS}
              />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Icon</label>
                <input
                  type="text"
                  value={formIcon}
                  onChange={(e) => setFormIcon(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="📂"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Stored Procedure *</label>
                <select
                  value={formSpName}
                  onChange={(e) => setFormSpName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  disabled={spLoading}
                >
                  <option value="">-- Chọn Procedure --</option>
                  {spList.map((sp) => (
                    <option key={sp} value={sp}>{sp}</option>
                  ))}
                </select>
              </div>
            </div>
            <Input
              label="Mô tả"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Mô tả ngắn về báo cáo (tùy chọn)"
            />
          </div>
        )}

        {/* Tab: Template */}
        {activeTab === 'template' && (
          <div className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h4 className="text-sm font-black text-blue-800 mb-2">📄 Tải lên file báo cáo mẫu (.xlsx)</h4>
              <p className="text-xs text-blue-600 mb-4">
                File mẫu sẽ được giữ nguyên header/footer, chỉ điền dữ liệu vào các ô đã mapping.
                Mapping kiểu <strong>scalar</strong> → điền 1 ô, <strong>list</strong> → chèn dòng dữ liệu.
              </p>

              {/* Upload zone */}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-2xl p-8 cursor-pointer hover:bg-blue-100 transition-colors">
                <span className="text-4xl mb-2">📁</span>
                <p className="text-sm font-bold text-blue-700">Nhấn để chọn file .xlsx</p>
                <p className="text-xs text-blue-400 mt-1">hoặc kéo thả file vào đây</p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const base64 = await fileToBase64(file);
                    setTemplatePreview(base64);
                    setFormTemplateFile(file.name);

                    // Parse sheet names từ template file
                    const ExcelJS = (await import('exceljs')).default;
                    const binaryStr = atob(base64.split(',')[1]);
                    const len = binaryStr.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                      bytes[i] = binaryStr.charCodeAt(i);
                    }
                    const wb = new ExcelJS.Workbook();
                    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
                    setAvailableSheets(wb.worksheets.map(ws => ws.name));
                  }}
                />
              </label>
            </div>

            {/* Preview */}
            {formTemplateFile && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">📊</span>
                    <div>
                      <p className="text-sm font-bold text-emerald-800">{formTemplateFile}</p>
                      <p className="text-xs text-emerald-500">Đã chọn — sẽ được lưu khi lưu báo cáo</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setFormTemplateFile(''); setTemplatePreview(''); }}
                    className="text-red-400 hover:text-red-600 text-xl font-bold"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Mapping type reminder */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <h4 className="text-sm font-black text-slate-700 mb-3">🔗 Cách Mapping hoạt động</h4>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex items-start gap-2">
                  <span className="font-black text-blue-600">scalar</span>
                  <span>→ Điền giá trị vào <strong>1 ô duy nhất</strong>. VD: ngày tháng báo cáo, tên bệnh viện.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-black text-emerald-600">list</span>
                  <span>→ Chèn <strong>nhiều dòng</strong> vào bảng. VD: danh sách bệnh nhân, dòng tổng cộng.</span>
                </div>
                <p className="mt-2 pt-2 border-t border-slate-200 text-slate-400">
                  <strong>VD thực tế:</strong> Báo cáo "Danh sách Bệnh nhân" có template với header "Bệnh viện ABC", dòng mẫu 1 ở dòng 10 (MaBN, HoTen, NgaySinh). Khi xuất, dữ liệu sẽ được điền vào dòng 10 trở đi.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Params */}
        {activeTab === 'params' && (
          <div className="space-y-3">
            {formParams.length === 0 ? (
              <EmptyState icon="⚙️" title="Chưa có tham số" description="Chọn Stored Procedure để tự động tải tham số" />
            ) : (
              formParams.map((param, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="col-span-2">
                    <Input
                      label="Tên tham số"
                      value={param.paramName || ''}
                      onChange={(e) => updateParam(idx, { paramName: e.target.value })}
                      placeholder="@TenParam"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      label="Label hiển thị"
                      value={param.paramLabel || ''}
                      onChange={(e) => updateParam(idx, { paramLabel: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      label="Loại"
                      value={param.paramType || 'text'}
                      onChange={(e) => updateParam(idx, { paramType: e.target.value as any })}
                      options={[
                        { value: 'text', label: 'Text' },
                        { value: 'date', label: 'Date' },
                        { value: 'number', label: 'Number' },
                        { value: 'select', label: 'Select' },
                      ]}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      label="Giá trị mặc định"
                      value={param.defaultValue || ''}
                      onChange={(e) => updateParam(idx, { defaultValue: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-center gap-3 pb-1">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={param.isRequired || false}
                        onChange={(e) => updateParam(idx, { isRequired: e.target.checked })}
                        className="w-4 h-4 accent-blue-600"
                      />
                      Bắt buộc
                    </label>
                    <button
                      onClick={() => setFormParams((p) => p.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 text-lg font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFormParams((p) => [...p, { paramName: '', paramLabel: '', paramType: 'text', displayOrder: p.length + 1 }])}
              icon={<span>➕</span>}
            >
              Thêm tham số
            </Button>
          </div>
        )}

        {/* Tab: Mapping */}
        {activeTab === 'mapping' && (
          <div className="space-y-3">
            {formMappings.length === 0 ? (
              <EmptyState icon="📍" title="Chưa có mapping" description="Chọn Stored Procedure để tự động tải các cột dữ liệu" />
            ) : (
              formMappings.map((mapping, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="col-span-4">
                    <Input label={mapping.mappingType === 'param' ? 'Tham số' : 'Cột dữ liệu'} value={mapping.fieldName} disabled className="bg-white uppercase" />
                  </div>
                  <div className="col-span-3">
                    <Input
                      label="Ô Excel (VD: A10)"
                      value={mapping.cellAddress || ''}
                      onChange={(e) => updateMapping(idx, { cellAddress: e.target.value.toUpperCase() })}
                      placeholder="A10"
                      className="uppercase font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      label="Loại mapping"
                      value={mapping.mappingType || 'list'}
                      onChange={(e) => updateMapping(idx, { mappingType: e.target.value as any })}
                      options={[
                        { value: 'list', label: '📋 Danh sách (nhiều dòng)' },
                        { value: 'scalar', label: '🔢 Giá trị đơn (1 ô)' },
                        { value: 'param', label: '⚙️ Tham số (giá trị nhập)' },
                      ]}
                    />
                  </div>
                  <div className="col-span-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Sheet</label>
                      <select
                        value={mapping.sheetName || ''}
                        onChange={(e) => updateMapping(idx, { sheetName: e.target.value || undefined })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500"
                      >
                        <option value="">— Mặc định (sheet 1) —</option>
                        {availableSheets.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="col-span-1 flex items-end justify-center pb-1">
                    <button
                      onClick={() => setFormMappings((m) => m.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 text-lg font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const existingParamFields = new Set(
                    formMappings.filter(m => m.mappingType === 'param').map(m => m.fieldName)
                  );
                  const newParamMappings: CreateMappingDto[] = formParams
                    .filter(p => p.paramName && !existingParamFields.has(p.paramName))
                    .map((p, idx) => ({
                      // Strip @ prefix so it matches the params object key (no @)
                      fieldName: p.paramName.replace(/^@/, ''),
                      cellAddress: '',
                      mappingType: 'param' as const,
                      displayOrder: formMappings.length + idx + 1,
                      resultSetIndex: selectedResultSet,
                    }));
                  if (newParamMappings.length > 0) {
                    setFormMappings(prev => [...prev, ...newParamMappings]);
                    setAllResultSetMappings(prev => {
                      const updated = { ...prev };
                      if (!updated[selectedResultSet]) updated[selectedResultSet] = [];
                      updated[selectedResultSet] = [
                        ...(updated[selectedResultSet] || []),
                        ...newParamMappings,
                      ];
                      return updated;
                    });
                    success(`Đã thêm ${newParamMappings.length} tham số vào mapping`);
                  } else {
                    showError('Tất cả tham số đã có trong mapping');
                  }
                }}
                icon={<span>⚙️</span>}
              >
                Detect tham số
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormMappings((m) => [...m, { fieldName: '', cellAddress: '', mappingType: 'list', displayOrder: m.length + 1, resultSetIndex: selectedResultSet }])}
                icon={<span>➕</span>}
              >
                Thêm mapping
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
