import React from 'react';
import { useToast } from '../../contexts/ToastContext';

export const Toast: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  const bgColors: Record<string, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const icons: Record<string, string> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto px-5 py-3.5 rounded-2xl border shadow-xl shadow-lg fade-in flex items-center gap-3 min-w-[300px] max-w-[420px] ${bgColors[toast.type]}`}
        >
          <span className="text-lg flex-shrink-0">{icons[toast.type]}</span>
          <p className="text-sm font-semibold flex-1 leading-snug">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity text-lg"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: React.ReactNode;
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Content */}
      <div
        className={`relative bg-white rounded-[24px] shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col overflow-hidden`}
      >
        {/* Header */}
        {title && (
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0">
            <h2 className="text-xl font-black text-slate-800">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all text-lg font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-8 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
