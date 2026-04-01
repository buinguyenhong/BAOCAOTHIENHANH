import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/Card';
import { useToast } from '../contexts/ToastContext';
import { adminReportApi, systemApi } from '../api/report.api';
import type {
  Report, ReportGroupView, SPMetadata,
  CreateReportDto, CreateParamDto, CreateMappingDto,
  ReportParameter, ReportMapping, TestRunResult,
  ParamType, ValueMode, OptionsSourceType,
  MappingValueType, ParamOption,
} from '../types';

const PARAM_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Số' },
  { value: 'date', label: 'Ngày' },
  { value: 'datetime', label: 'Ngày + Giờ' },
  { value: 'select', label: 'Chọn 1' },
  { value: 'multiselect', label: 'Chọn nhiều' },
  { value: 'textarea', label: 'Văn bản dài' },
];

const VALUE_MODE_OPTIONS = [
  { value: 'single', label: 'single (1 giá trị)' },
  { value: 'csv', label: 'csv (1,2,3)' },
  { value: 'json', label: 'json ([1,2,3])' },
];

const OPTIONS_SOURCE_OPTIONS = [
  { value: 'none', label: '—' },
  { value: 'static', label: 'Danh sách tĩnh' },
  { value: 'sql', label: 'Từ SQL query' },
];

const VALUE_TYPE_OPTIONS = [
  { value: 'text', label: '📝 Text' },
  { value: 'number', label: '🔢 Số' },
  { value: 'date', label: '📅 Date (dd/MM/yyyy)' },
  { value: 'datetime', label: '🕐 DateTime (dd/MM/yyyy HH:mm:ss)' },
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

  // ── Fetch ──────────────────────────────────────────

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
          Array.from(map.entries()).map(([name, rpts]) => ({
            id: name.toLowerCase().replace(/\s+/g, '-'),
            name,
            icon: rpts[0]?.groupIcon || '📂',
            reports: rpts,
          }))
        );
      }
    } catch (err: any) { showError(err.message); }
    finally { setLoading(false); }
  }, []);

  const fetchSPs = useCallback(async () => {
    setSpLoading(true);
    try {
      const res = await systemApi.getStoredProcedures();
      if (res.success && res.data) setSpList(res.data.map(s => s.name));
    } catch { /* ignore */ }
    finally { setSpLoading(false); }
  }, []);

  useEffect(() => { fetchReports(); fetchSPs(); }, []);

  // ── SP metadata → auto-generate params & mappings ──────────

  useEffect(() => {
    if (!formSpName) return;
    systemApi.getSPMetadata(formSpName).then(res => {
      if (!res.success || !res.data) return;
      setSpMetadata(res.data);

      // Chỉ auto-generate khi tạo mới hoặc đổi SP
      if (editingReport && editingReport.spName === formSpName) return;

      // Auto-generate params
      const autoParams: CreateParamDto[] = (res.data.parameters || []).map((p, idx) => {
        const inferred = inferParamType(p.type || '', p.name);
        return {
          paramName: p.name,
          paramLabel: p.name.replace(/^@/, '').replace(/([A-Z])/g, ' $1').trim(),
          paramType: inferred,
          sqlType: p.type || null,
          maxLength: p.maxLength ?? null,
          precision: p.precision ?? null,
          scale: p.scale ?? null,
          isNullable: p.isNullable ?? true,
          hasDefaultValue: false,
          valueMode: 'single',
          optionsSourceType: 'none',
          options: null,
          optionsQuery: null,
          placeholder: null,
          defaultValue: null,
          isRequired: !p.hasDefaultValue && !p.isNullable,
          displayOrder: idx + 1,
        };
      });
      setFormParams(autoParams);

      // Auto-generate mappings
      const autoMappings: CreateMappingDto[] = (res.data.columns || []).map((col, idx) => ({
        fieldName: col.name,
        cellAddress: `A${10 + idx}`,
        mappingType: 'list',
        displayOrder: idx + 1,
        sheetName: availableSheets[0] || undefined,
        recordsetIndex: 0,
        valueType: 'text',
        formatPattern: null,
      }));
      setFormMappings(autoMappings);
      setAllResultSetMappings({ 0: autoMappings });
    }).catch(() => setSpMetadata(null));
  }, [formSpName, editingReport]);

  // ── Helpers ────────────────────────────────────────

  function inferParamType(sqlType: string, paramName: string): ParamType {
    const lower = paramName.toLowerCase();
    const upper = sqlType.toUpperCase();
    if (lower.includes('ngay') || lower.includes('date') || lower.includes('tungay') || lower.includes('denngay')) {
      if (lower.includes('gio') || lower.includes('time') || sqlType.toLowerCase().includes('datetime')) return 'datetime';
      return 'date';
    }
    if (upper.includes('INT') || upper.includes('DECIMAL') || upper.includes('FLOAT') || upper.includes('NUMERIC') || upper.includes('MONEY')) return 'number';
    if (lower.includes('ids') || lower.includes('list') || lower.includes('multiselect')) return 'multiselect';
    return 'text';
  }

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── Test run ──────────────────────────────────────

  const handleTestRun = async () => {
    if (!formSpName) return;
    setTestRunning(true);
    setTestRunError('');
    setTestRunResult(null);
    setSelectedResultSet(0);
    try {
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
        setSelectedResultSet(0);

        // Auto-generate mappings cho TẤT CẢ recordsets
        const allMappings: Record<number, CreateMappingDto[]> = {};
        result.recordsets.forEach((rs, rsIdx) => {
          if (!rs.length) { allMappings[rsIdx] = []; return; }
          const cols = Object.keys(rs[0]);
          if (!cols.length) { allMappings[rsIdx] = []; return; }
          allMappings[rsIdx] = cols.map((col, idx) => ({
            fieldName: col,
            cellAddress: `A${10 + idx}`,
            mappingType: 'list' as const,
            displayOrder: idx + 1,
            sheetName: availableSheets[0] || undefined,
            recordsetIndex: rsIdx,
            valueType: 'text' as const,
            formatPattern: null,
          }));
        });
        setAllResultSetMappings(allMappings);
        setFormMappings(allMappings[0] || []);
      } else {
        setTestRunError(res.error || 'Không có kết quả');
      }
    } catch (err: any) { setTestRunError(err.response?.data?.error || err.message); }
    finally { setTestRunning(false); }
  };

  // ── Open forms ───────────────────────────────────

  const openNewForm = () => {
    setEditingReport(null);
    setFormName(''); setFormGroup('Tổng hợp'); setFormIcon('📂');
    setFormSpName(''); setFormDesc('');
    setFormParams([]); setFormMappings([]); setAllResultSetMappings({});
    setSpMetadata(null); setFormTemplateFile(''); setTemplatePreview('');
    setTestRunResult(null); setTestRunError('');
    setSelectedResultSet(0); setAvailableSheets([]);
    setActiveTab('info'); setShowForm(true);
  };

  const openEditForm = async (report: Report) => {
    setEditingReport(report);
    setFormName(report.name);
    setFormGroup(report.groupName || 'Tổng hợp');
    setFormIcon(report.groupIcon || '📂');
    setFormSpName(report.spName);
    setFormDesc(report.description || '');
    setFormTemplateFile(report.templateFile || '');

    // Load params — fill defaults cho trường mới
    setFormParams((report.parameters || []).map(p => ({
      paramName: p.paramName,
      paramLabel: p.paramLabel || p.paramName,
      paramType: p.paramType || 'text',
      sqlType: p.sqlType ?? null,
      maxLength: p.maxLength ?? null,
      precision: p.precision ?? null,
      scale: p.scale ?? null,
      isNullable: p.isNullable ?? true,
      hasDefaultValue: p.hasDefaultValue ?? false,
      valueMode: (p as any).valueMode || 'single',
      optionsSourceType: (p as any).optionsSourceType || 'none',
      options: (p as any).options || null,
      optionsQuery: (p as any).optionsQuery || null,
      placeholder: (p as any).placeholder || null,
      defaultValue: p.defaultValue || null,
      isRequired: p.isRequired,
      displayOrder: p.displayOrder,
    })));

    // Load mappings
    const loaded = (report.mappings || []).map((m): CreateMappingDto => ({
      fieldName: m.fieldName,
      cellAddress: m.cellAddress || '',
      mappingType: m.mappingType,
      displayOrder: m.displayOrder,
      sheetName: m.sheetName || undefined,
      recordsetIndex: m.recordsetIndex ?? 0,
      valueType: m.valueType || 'text',
      formatPattern: m.formatPattern ?? null,
    }));

    const grouped: Record<number, CreateMappingDto[]> = {};
    loaded.forEach(m => {
      const idx = m.recordsetIndex ?? 0;
      if (!grouped[idx]) grouped[idx] = [];
      grouped[idx].push(m);
    });
    setAllResultSetMappings(grouped);
    const firstIdx = Object.keys(grouped).map(Number).sort((a, b) => a - b)[0] ?? 0;
    setFormMappings(grouped[firstIdx] || []);
    setSelectedResultSet(firstIdx);

    setTemplatePreview('');
    setTestRunResult(null); setTestRunError('');
    setActiveTab('info'); setShowForm(true);

    if (report.templateFile) {
      try {
        const res = await adminReportApi.getTemplateSheets(report.id);
        setAvailableSheets(res.success && res.data ? res.data : []);
      } catch { setAvailableSheets([]); }
    } else {
      setAvailableSheets([]);
    }
  };

  // ── Save ──────────────────────────────────────────

  const handleSave = async () => {
    if (!formName || !formSpName) { showError('Tên báo cáo và Stored Procedure là bắt buộc'); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: formName, groupName: formGroup, groupIcon: formIcon,
        spName: formSpName, description: formDesc,
        parameters: formParams.filter(p => p.paramName),
        mappings: Object.values(allResultSetMappings).flat().filter(m => m.fieldName),
      };
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
    } catch (err: any) { showError(err.response?.data?.error || err.message || 'Lỗi lưu báo cáo'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Xóa báo cáo "${name}"?`)) return;
    setDeleting(id);
    try {
      await adminReportApi.deleteReport(id);
      success('Đã xóa báo cáo');
      fetchReports();
    } catch (err: any) { showError(err.response?.data?.error || err.message); }
    finally { setDeleting(null); }
  };

  // ── Update helpers ────────────────────────────────

  const updateParam = (idx: number, updates: Partial<CreateParamDto>) => {
    setFormParams(prev => prev.map((p, i) => i === idx ? { ...p, ...updates } : p));
  };

  const updateMapping = (idx: number, updates: Partial<CreateMappingDto>) => {
    const rsIdx = selectedResultSet;
    setFormMappings(prev => prev.map((m, i) => i === idx ? { ...m, ...updates } : m));
    setAllResultSetMappings(prev => {
      const updated = { ...prev };
      if (updated[rsIdx]) {
        updated[rsIdx] = updated[rsIdx].map((m, i) => i === idx ? { ...m, ...updates } : m);
      }
      return updated;
    });
  };

  const addParam = () => {
    setFormParams(prev => [...prev, {
      paramName: '', paramLabel: '', paramType: 'text',
      valueMode: 'single', optionsSourceType: 'none',
      options: null, optionsQuery: null, placeholder: null,
      defaultValue: null, isRequired: false, displayOrder: prev.length + 1,
    }]);
  };

  const addMapping = () => {
    const newMapping: CreateMappingDto = {
      fieldName: '', cellAddress: '', mappingType: 'list',
      displayOrder: formMappings.length + 1,
      sheetName: availableSheets[0] || undefined,
      recordsetIndex: selectedResultSet,
      valueType: 'text', formatPattern: null,
    };
    setFormMappings(prev => [...prev, newMapping]);
    setAllResultSetMappings(prev => {
      const updated = { ...prev };
      const rsIdx = selectedResultSet;
      if (!updated[rsIdx]) updated[rsIdx] = [];
      updated[rsIdx] = [...updated[rsIdx], newMapping];
      return updated;
    });
  };

  // ── Result set tabs ─────────────────────────────

  const availableRecordsetIndices = Object.keys(allResultSetMappings).map(Number).sort((a, b) => a - b);

  const showResultSetPicker = testRunResult && availableRecordsetIndices.length > 1;

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
            <Button onClick={openNewForm} icon={<span>➕</span>}>Tạo báo cáo mới</Button>
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
              <EmptyState icon="📋" title="Chưa có báo cáo nào" description="Nhấn 'Tạo báo cáo mới' để bắt đầu thiết kế" />
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
                    {reports.map(r => (
                      <tr key={r.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-slate-800">{r.name}</p>
                          {r.description && <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm">{r.groupIcon}</span>
                          <span className="text-xs text-slate-500 ml-1">{r.groupName}</span>
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">{r.spName}</code>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">
                            {(r.parameters || []).length} tham số · {(r.mappings || []).length} mapping
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEditForm(r)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">✏️ Sửa</button>
                            <button onClick={() => handleDelete(r.id, r.name)} disabled={deleting === r.id} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50">
                              {deleting === r.id ? '...' : '🗑️'}
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

      {/* ── Create/Edit Modal ── */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingReport ? '✏️ Cập nhật báo cáo' : '➕ Tạo báo cáo mới'}
        size="full"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Hủy</Button><Button loading={saving} onClick={handleSave}>{editingReport ? 'Lưu thay đổi' : 'Tạo báo cáo'}</Button></>}
      >
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200 pb-4">
          {(['info', 'params', 'mapping', 'template'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {tab === 'info' ? '📋 Thông tin' :
               tab === 'params' ? `⚙️ Tham số (${formParams.length})` :
               tab === 'mapping' ? `📍 Mapping (${formMappings.length})` :
               formTemplateFile ? `📄 Template: ${formTemplateFile}` : '📄 Template'}
            </button>
          ))}
        </div>

        {/* Auto-detect + Test run toolbar */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <Button variant="outline" size="sm" loading={spLoading} onClick={async () => {
            if (!formSpName) { showError('Chọn Stored Procedure trước'); return; }
            setSpLoading(true);
            try {
              const res = await systemApi.getSPMetadata(formSpName);
              if (res.success && res.data) {
                setSpMetadata(res.data);
                if (!editingReport || editingReport.spName !== formSpName) {
                  const autoParams: CreateParamDto[] = (res.data.parameters || []).map((p, idx) => ({
                    paramName: p.name, paramLabel: p.name.replace(/^@/, '').replace(/([A-Z])/g, ' $1').trim(),
                    paramType: inferParamType(p.type || '', p.name),
                    sqlType: p.type || null,
                    maxLength: p.maxLength ?? null, precision: p.precision ?? null, scale: p.scale ?? null,
                    isNullable: p.isNullable ?? true, hasDefaultValue: false,
                    valueMode: 'single', optionsSourceType: 'none', options: null, optionsQuery: null, placeholder: null,
                    defaultValue: null, isRequired: !p.hasDefaultValue && !p.isNullable, displayOrder: idx + 1,
                  }));
                  const autoMappings: CreateMappingDto[] = (res.data.columns || []).map((col, idx) => ({
                    fieldName: col.name, cellAddress: `A${10 + idx}`, mappingType: 'list' as const,
                    displayOrder: idx + 1, sheetName: availableSheets[0] || undefined,
                    recordsetIndex: 0, valueType: 'text' as const, formatPattern: null,
                  }));
                  setFormParams(autoParams);
                  setFormMappings(autoMappings);
                  setAllResultSetMappings({ 0: autoMappings });
                  success('Đã tự động nhận diện!');
                }
              }
            } catch { showError('Không lấy được metadata SP'); }
            finally { setSpLoading(false); }
          }} icon={<span>🔍</span>}>Auto-detect</Button>

          <Button variant="outline" size="sm" onClick={handleTestRun} loading={testRunning} icon={<span>▶️</span>}>Chạy thử</Button>

          {testRunResult && (
            <div className="ml-auto flex items-center gap-2 text-xs text-emerald-700 font-bold">
              <span>✅</span>
              <span>{testRunResult.columns.length} cột · {testRunResult.rows.length} dòng</span>
              {testRunResult.recordsets.length > 1 && (
                <select value={selectedResultSet} onChange={e => {
                  const idx = parseInt(e.target.value);
                  setSelectedResultSet(idx);
                  const rs = testRunResult.recordsets[idx] || [];
                  const cols = rs.length ? Object.keys(rs[0]) : [];
                  setFormMappings(allResultSetMappings[idx] || []);
                }} className="ml-2 px-2 py-1 border border-emerald-300 rounded-lg text-xs">
                  {testRunResult.recordsets.map((_, idx) => (
                    <option key={idx} value={idx}>Result {idx + 1}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {testRunError && <div className="ml-auto flex items-center gap-2 text-xs text-red-600 font-bold"><span>❌</span><span>{testRunError}</span></div>}
        </div>

        {/* Test run preview */}
        {testRunResult && (
          <div className="mb-6 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl overflow-auto">
            <h4 className="text-sm font-black text-emerald-800 mb-3">📊 Kết quả chạy thử — Result {selectedResultSet + 1}: {testRunResult.rows.length} dòng</h4>
            <div className="overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-emerald-100">
                  <tr>
                    {testRunResult.columns.map(col => (
                      <th key={col} className="px-3 py-2 text-left font-black text-emerald-800 border border-emerald-200 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {testRunResult.rows.map((row, i) => (
                    <tr key={i} className="bg-white border border-emerald-200">
                      {testRunResult.columns.map(col => (
                        <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-xs truncate">{String(row[col] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Info ── */}
        {activeTab === 'info' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <Input label="Tên báo cáo *" value={formName} onChange={e => setFormName(e.target.value)} placeholder="VD: Báo cáo Doanh thu theo tháng" />
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Nhóm báo cáo</label>
                <select value={formGroup} onChange={e => setFormGroup(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500">
                  {['Tổng hợp','Bệnh nhân','Tài chính','Dược','Xét nghiệm','Khoa Phòng','Nhân sự'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Icon</label>
                <input type="text" value={formIcon} onChange={e => setFormIcon(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500" placeholder="📂" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Stored Procedure *</label>
                <select value={formSpName} onChange={e => setFormSpName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500" disabled={spLoading}>
                  <option value="">-- Chọn Procedure --</option>
                  {spList.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                </select>
              </div>
            </div>
            <Input label="Mô tả" value={formDesc} onChange={e => setFormDesc(e.target.value)} />
          </div>
        )}

        {/* ── Tab: Params ── */}
        {activeTab === 'params' && (
          <div className="space-y-2">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 uppercase px-2">
              <div className="col-span-2">Tên tham số</div>
              <div className="col-span-2">Label hiển thị</div>
              <div className="col-span-1">Loại nhập</div>
              <div className="col-span-1">Serialize</div>
              <div className="col-span-2">Options / Query</div>
              <div className="col-span-2">Placeholder / Default</div>
              <div className="col-span-1 text-center">Bắt buộc</div>
              <div className="col-span-1"></div>
            </div>

            {formParams.map((param, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-xl border border-slate-200">
                {/* Tên tham số */}
                <div className="col-span-2">
                  <input value={param.paramName || ''} onChange={e => updateParam(idx, { paramName: e.target.value })}
                    placeholder="@TenParam" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:border-blue-500 bg-white" />
                  {param.sqlType && <p className="text-[9px] text-slate-400 mt-0.5 truncate">{param.sqlType}</p>}
                </div>
                {/* Label */}
                <div className="col-span-2">
                  <input value={param.paramLabel || ''} onChange={e => updateParam(idx, { paramLabel: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white" />
                </div>
                {/* Loại nhập */}
                <div className="col-span-1">
                  <select value={param.paramType || 'text'} onChange={e => updateParam(idx, { paramType: e.target.value as ParamType })}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white">
                    {PARAM_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {/* Serialize mode */}
                <div className="col-span-1">
                  <select value={param.valueMode || 'single'} onChange={e => updateParam(idx, { valueMode: e.target.value as ValueMode })}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white">
                    {VALUE_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {/* Options / Query */}
                <div className="col-span-2">
                  {(param.paramType === 'select' || param.paramType === 'multiselect') ? (
                    <select value={param.optionsSourceType || 'none'} onChange={e => updateParam(idx, { optionsSourceType: e.target.value as OptionsSourceType })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white mb-1">
                      {OPTIONS_SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : <div />}
                  {(param.paramType === 'select' || param.paramType === 'multiselect') && param.optionsSourceType === 'static' ? (
                    <textarea value={(param.options || []).map(o => `${o.value}:${o.label}`).join('\n')}
                      onChange={e => {
                        const lines = e.target.value.split('\n').filter(Boolean);
                        const opts: ParamOption[] = lines.map(line => {
                          const [v, ...rest] = line.split(':');
                          return { value: v.trim(), label: (rest.join(':') || v.trim()) };
                        });
                        updateParam(idx, { options: opts });
                      }}
                      placeholder="1:Giá trị 1&#10;2:Giá trị 2"
                      rows={2}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white resize-y" />
                  ) : (param.paramType === 'select' || param.paramType === 'multiselect') && param.optionsSourceType === 'sql' ? (
                    <input value={param.optionsQuery || ''} onChange={e => updateParam(idx, { optionsQuery: e.target.value })}
                      placeholder="SELECT MaKhoa, TenKhoa FROM Khoa"
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:border-blue-500 bg-white" />
                  ) : <div />}
                </div>
                {/* Placeholder / Default */}
                <div className="col-span-2">
                  <input value={param.placeholder || ''} onChange={e => updateParam(idx, { placeholder: e.target.value })}
                    placeholder="Placeholder" className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white mb-1" />
                  <input value={param.defaultValue || ''} onChange={e => updateParam(idx, { defaultValue: e.target.value })}
                    placeholder="Giá trị mặc định"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white" />
                </div>
                {/* Required */}
                <div className="col-span-1 flex items-center justify-center pb-1">
                  <input type="checkbox" checked={param.isRequired || false} onChange={e => updateParam(idx, { isRequired: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 cursor-pointer" />
                </div>
                {/* Delete */}
                <div className="col-span-1 flex items-center justify-center pb-1">
                  <button onClick={() => setFormParams(p => p.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-600 text-lg font-bold">×</button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addParam} icon={<span>➕</span>}>Thêm tham số</Button>
          </div>
        )}

        {/* ── Tab: Mapping ── */}
        {activeTab === 'mapping' && (
          <div className="space-y-2">
            {/* Result set picker */}
            {showResultSetPicker && (
              <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                <span className="text-xs font-bold text-indigo-700">Result Set:</span>
                {availableRecordsetIndices.map(idx => (
                  <button key={idx} onClick={() => { setSelectedResultSet(idx); setFormMappings(allResultSetMappings[idx] || []); }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${selectedResultSet === idx ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-100'}`}>
                    Result {idx + 1} ({allResultSetMappings[idx]?.length || 0} mapping)
                  </button>
                ))}
              </div>
            )}

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 uppercase px-2">
              <div className="col-span-2">Cột dữ liệu</div>
              <div className="col-span-1">Loại mapping</div>
              <div className="col-span-1">Sheet</div>
              <div className="col-span-1">RS Index</div>
              <div className="col-span-1">Value Type</div>
              <div className="col-span-1">Excel Cell</div>
              <div className="col-span-2">Format Pattern</div>
              <div className="col-span-1">Display</div>
              <div className="col-span-1"></div>
            </div>

            {formMappings.map((mapping, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-xl border border-slate-200">
                {/* Field name */}
                <div className="col-span-2">
                  <input value={mapping.fieldName} disabled
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono bg-slate-100 text-slate-500 uppercase" />
                </div>
                {/* Mapping type */}
                <div className="col-span-1">
                  <select value={mapping.mappingType || 'list'} onChange={e => updateMapping(idx, { mappingType: e.target.value as any })}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white">
                    <option value="list">📋 Danh sách</option>
                    <option value="scalar">🔢 Giá trị đơn</option>
                    <option value="param">⚙️ Tham số</option>
                  </select>
                </div>
                {/* Sheet */}
                <div className="col-span-1">
                  <select value={mapping.sheetName || ''} onChange={e => updateMapping(idx, { sheetName: e.target.value || undefined })}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white">
                    <option value="">— Mặc định —</option>
                    {availableSheets.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {/* Recordset index */}
                <div className="col-span-1">
                  <select value={mapping.recordsetIndex ?? 0} onChange={e => updateMapping(idx, { recordsetIndex: parseInt(e.target.value) })}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white">
                    {availableRecordsetIndices.map(idx => <option key={idx} value={idx}>{idx}</option>)}
                  </select>
                </div>
                {/* Value type */}
                <div className="col-span-1">
                  <select value={mapping.valueType || 'text'} onChange={e => updateMapping(idx, { valueType: e.target.value as MappingValueType })}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white">
                    {VALUE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {/* Excel cell */}
                <div className="col-span-1">
                  <input value={mapping.cellAddress || ''} onChange={e => updateMapping(idx, { cellAddress: e.target.value.toUpperCase() })}
                    placeholder="A10" className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:border-blue-500 bg-white uppercase" />
                </div>
                {/* Format pattern */}
                <div className="col-span-2">
                  <input value={mapping.formatPattern || ''} onChange={e => updateMapping(idx, { formatPattern: e.target.value || null })}
                    placeholder="dd/MM/yyyy HH:mm:ss (override)"
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white" />
                </div>
                {/* Display order */}
                <div className="col-span-1">
                  <input type="number" value={mapping.displayOrder ?? idx + 1} onChange={e => updateMapping(idx, { displayOrder: parseInt(e.target.value) || idx + 1 })}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white" />
                </div>
                {/* Delete */}
                <div className="col-span-1 flex items-center justify-center pb-1">
                  <button onClick={() => {
                    setFormMappings(m => m.filter((_, i) => i !== idx));
                    setAllResultSetMappings(prev => {
                      const updated = { ...prev };
                      updated[selectedResultSet] = (updated[selectedResultSet] || []).filter((_, i) => i !== idx);
                      return updated;
                    });
                  }} className="text-red-400 hover:text-red-600 text-lg font-bold">×</button>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addMapping} icon={<span>➕</span>}>Thêm mapping</Button>
              <Button variant="outline" size="sm" onClick={() => {
                const existingFields = new Set(formMappings.map(m => m.fieldName));
                const candidates = formParams.filter(p => p.paramName && !existingFields.has(p.paramName)).map((p, idx) => ({
                  fieldName: p.paramName.replace(/^@/, ''),
                  cellAddress: '', mappingType: 'param' as const,
                  displayOrder: formMappings.length + idx + 1,
                  sheetName: availableSheets[0] || undefined,
                  recordsetIndex: selectedResultSet,
                  valueType: p.paramType === 'date' || p.paramType === 'datetime' ? 'date' as MappingValueType : 'text' as MappingValueType,
                  formatPattern: null,
                }));
                if (!candidates.length) { showError('Tất cả tham số đã có trong mapping'); return; }
                const updated = [...formMappings, ...candidates];
                setFormMappings(updated);
                setAllResultSetMappings(prev => {
                  const u = { ...prev };
                  u[selectedResultSet] = updated;
                  return u;
                });
                success(`Đã thêm ${candidates.length} tham số vào mapping`);
              }} icon={<span>⚙️</span>}>Thêm từ Tham số</Button>
            </div>
          </div>
        )}

        {/* ── Tab: Template ── */}
        {activeTab === 'template' && (
          <div className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h4 className="text-sm font-black text-blue-800 mb-2">📄 Tải lên file báo cáo mẫu (.xlsx)</h4>
              <p className="text-xs text-blue-600 mb-4">
                File mẫu giữ nguyên layout, chỉ điền dữ liệu vào ô đã mapping.
                scalar → 1 ô, list → chèn dòng.
              </p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-2xl p-8 cursor-pointer hover:bg-blue-100 transition-colors">
                <span className="text-4xl mb-2">📁</span>
                <p className="text-sm font-bold text-blue-700">Nhấn để chọn file .xlsx</p>
                <p className="text-xs text-blue-400 mt-1">hoặc kéo thả file vào đây</p>
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const base64 = await fileToBase64(file);
                    setTemplatePreview(base64);
                    setFormTemplateFile(file.name);
                    const ExcelJS = (await import('exceljs')).default;
                    const binaryStr = atob(base64.split(',')[1]);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                    const wb = new ExcelJS.Workbook();
                    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
                    setAvailableSheets(wb.worksheets.map(ws => ws.name));
                  }} />
              </label>
            </div>
            {formTemplateFile && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📊</span>
                  <div><p className="text-sm font-bold text-emerald-800">{formTemplateFile}</p><p className="text-xs text-emerald-500">Đã chọn</p></div>
                </div>
                <button onClick={() => { setFormTemplateFile(''); setTemplatePreview(''); setAvailableSheets([]); }}
                  className="text-red-400 hover:text-red-600 text-xl font-bold">×</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
