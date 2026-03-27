import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, hover = false }) => {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${hover ? 'hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

const badgeVariants: Record<string, string> = {
  default: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  danger: 'bg-red-50 text-red-700 border border-red-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', size = 'sm' }) => {
  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-wide rounded-lg ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      } ${badgeVariants[variant]}`}
    >
      {children}
    </span>
  );
};

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  size = 'md',
  className = '',
}) => {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <svg
      className={`animate-spin text-blue-600 ${sizes[size]} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
};

export const EmptyState: React.FC<{ icon?: string; title: string; description?: string }> = ({
  icon = '📭',
  title,
  description,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <p className="text-base font-semibold text-slate-400">{title}</p>
      {description && (
        <p className="text-sm text-slate-300 mt-1 max-w-xs">{description}</p>
      )}
    </div>
  );
};
