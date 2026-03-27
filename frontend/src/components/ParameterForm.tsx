import React from 'react';
import type { ReportParameter } from '../types';
import { Select } from './ui/Select';

interface ParameterFormProps {
  parameters: ReportParameter[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
}

export const ParameterForm: React.FC<ParameterFormProps> = ({
  parameters,
  values,
  onChange,
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
          <div key={param.id} className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              {param.paramLabel || param.paramName}
              {param.isRequired && <span className="text-red-500">*</span>}
            </label>

            {param.paramType === 'select' ? (
              <Select
                value={values[param.paramName] || ''}
                onChange={(e) => onChange(param.paramName, e.target.value)}
                options={
                  param.options
                    ? param.options.map((opt) => ({ value: opt, label: opt }))
                    : []
                }
                placeholder={`-- Chọn ${param.paramLabel || param.paramName} --`}
              />
            ) : (
              <input
                type={param.paramType === 'date' ? 'date' : param.paramType === 'number' ? 'number' : 'text'}
                value={values[param.paramName] || ''}
                onChange={(e) => onChange(param.paramName, e.target.value)}
                placeholder={param.defaultValue || ''}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
              />
            )}
          </div>
        ))}
    </div>
  );
};
