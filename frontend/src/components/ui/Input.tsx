import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`w-full px-4 py-2.5 border rounded-xl text-sm font-medium outline-none transition-all
              ${icon ? 'pl-10' : ''}
              ${error
                ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-200'
                : 'border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
              }
              placeholder:text-slate-300 ${className}`}
            {...props}
          />
        </div>
        {error && <p className="mt-1 text-xs text-red-500 font-medium">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
