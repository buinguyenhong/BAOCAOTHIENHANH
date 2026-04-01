import React, { useEffect, useState } from 'react';
import type { ReportParameter } from '../types';
import { Select } from './ui/Select';

interface ParameterFormProps {
  parameters: ReportParameter[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  /** Gọi API lấy options cho param có optionsSourceType='sql' */
  fetchOptions?: (param: ReportParameter) => Promise<Array<{ value: string; label: string }>>;
}

export const ParameterForm: React.FC<ParameterFormProps> = ({
  parameters,
  values,
  onChange,
  fetchOptions,
}) => {
  if (!parameters || parameters.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 italic">
        <span>ℹ️</span> Báo cáo này không có tham số
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {parameters
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((param) => (
          <ParamField
            key={param.id}
            param={param}
            value={values[param.paramName]}
            onChange={(v) => onChange(param.paramName, v)}
            fetchOptions={fetchOptions}
          />
        ))}
    </div>
  );
};

// ─── Individual param field ───────────────────────────────────────────────────

interface ParamFieldProps {
  param: ReportParameter;
  value: any;
  onChange: (value: any) => void;
  fetchOptions?: (param: ReportParameter) => Promise<Array<{ value: string; label: string }>>;
}

const ParamField: React.FC<ParamFieldProps> = ({ param, value, onChange, fetchOptions }) => {
  const [dynamicOptions, setDynamicOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const isSelect = param.paramType === 'select' || param.paramType === 'multiselect';

  // Khi có fetchOptions (optionsSourceType='sql') → fetch khi mount
  useEffect(() => {
    if (!isSelect || param.optionsSourceType !== 'sql' || !fetchOptions) return;

    const cached = (window as any).__paramOptionsCache?.[param.id];
    if (cached) {
      setDynamicOptions(cached);
      return;
    }

    setLoadingOptions(true);
    fetchOptions(param)
      .then((opts) => {
        setDynamicOptions(opts);
        // Cache để không fetch lại
        (window as any).__paramOptionsCache = (window as any).__paramOptionsCache || {};
        (window as any).__paramOptionsCache[param.id] = opts;
      })
      .catch(() => setDynamicOptions([]))
      .finally(() => setLoadingOptions(false));
  }, [param.id, param.optionsSourceType, isSelect, fetchOptions]);

  // Resolve options: sql > static > []
  const resolvedOptions: Array<{ value: string; label: string }> =
    param.optionsSourceType === 'sql' ? dynamicOptions
    : param.optionsSourceType === 'static' ? (param.options ?? []).map(o => ({ value: o.value, label: o.label }))
    : [];

  const currentValue = value ?? '';
  const label = (
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
      {param.paramLabel || param.paramName}
      {param.isRequired && <span className="text-red-500">*</span>}
    </label>
  );

  // ── Single select ────────────────────────────────────────────────────────
  if (param.paramType === 'select') {
    return (
      <div className="space-y-1.5">
        {label}
        <Select
          value={currentValue}
          onChange={(e) => onChange(e.target.value)}
          options={resolvedOptions}
          placeholder={loadingOptions ? 'Đang tải...' : `-- Chọn ${param.paramLabel || param.paramName} --`}
          disabled={loadingOptions}
        />
      </div>
    );
  }

  // ── Multiselect ─────────────────────────────────────────────────────────
  if (param.paramType === 'multiselect') {
    // value có thể là: string[] | string (csv/json)
    const selectedValues: string[] =
      Array.isArray(value) ? value
      : typeof value === 'string' && value ? value.split(',').map(v => v.trim()).filter(Boolean)
      : [];

    const handleToggle = (optValue: string) => {
      const next = selectedValues.includes(optValue)
        ? selectedValues.filter(v => v !== optValue)
        : [...selectedValues, optValue];

      if (param.valueMode === 'csv') {
        onChange(next.join(','));
      } else if (param.valueMode === 'json') {
        onChange(JSON.stringify(next));
      } else {
        // valueMode='single' → chỉ lấy giá trị đầu
        onChange(next.length > 0 ? next[next.length - 1] : '');
      }
    };

    return (
      <div className="space-y-1.5">
        {label}
        {loadingOptions ? (
          <div className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-400 bg-slate-50">
            Đang tải options...
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-1.5 max-h-48 overflow-y-auto">
            {resolvedOptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa có lựa chọn</p>
            ) : (
              resolvedOptions.map((opt) => {
                const checked = selectedValues.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer hover:bg-blue-50 rounded-lg px-2 py-1.5 transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(opt.value)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer rounded"
                    />
                    <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                    <span className="text-xs text-slate-400 ml-auto font-mono">{opt.value}</span>
                  </label>
                );
              })
            )}
            {resolvedOptions.length > 0 && (
              <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                {param.valueMode === 'csv' ? 'Gửi dạng: "1,2,3"' :
                 param.valueMode === 'json' ? 'Gửi dạng: ["1","2","3"]' :
                 'Gửi dạng: giá trị cuối'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Textarea ────────────────────────────────────────────────────────────
  if (param.paramType === 'textarea') {
    return (
      <div className="space-y-1.5 col-span-2">
        {label}
        <textarea
          value={currentValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.placeholder ?? param.defaultValue ?? ''}
          rows={3}
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white resize-y"
        />
      </div>
    );
  }

  // ── Input types (text / number / date / datetime) ───────────────────────
  let inputType = 'text';
  if (param.paramType === 'date') inputType = 'date';
  if (param.paramType === 'datetime') inputType = 'datetime-local';
  if (param.paramType === 'number') inputType = 'number';

  return (
    <div className="space-y-1.5">
      {label}
      <input
        type={inputType}
        value={currentValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.placeholder ?? ''}
        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
      />
    </div>
  );
};
