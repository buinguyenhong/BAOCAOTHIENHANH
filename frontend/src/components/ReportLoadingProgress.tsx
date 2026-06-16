import React, { useState, useEffect } from 'react';

interface ReportLoadingProgressProps {
  spName: string;
}

export const ReportLoadingProgress: React.FC<ReportLoadingProgressProps> = ({ spName }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Các bước tiến trình mô phỏng/suy luận dựa trên thời gian thực tế
  const steps = [
    { label: 'Khởi động tiến trình và thiết lập tham số', activeAt: 0, duration: 2 },
    { label: 'Kết nối tới Database bệnh viện (HospitalDB)', activeAt: 2, duration: 3 },
    { label: `Đang thực thi Stored Procedure [${spName}]`, activeAt: 5, duration: 5 },
    { label: 'Database đang xử lý và tập hợp dữ liệu', activeAt: 10, duration: 10 },
    { label: 'Truyền tải dữ liệu kết quả về Web Server', activeAt: 20, duration: 9999 },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[400px] my-4 transition-all duration-300">
      {/* Visual pulsing loader with elapsed timer */}
      <div className="relative flex items-center justify-center w-28 h-28 mb-6">
        <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400/20 animate-ping"></span>
        <span className="absolute inline-flex h-4/5 w-4/5 rounded-full bg-blue-300/10 animate-pulse"></span>
        
        {/* Spinner */}
        <div className="w-16 h-16 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin"></div>
        
        {/* Timer centered */}
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-lg font-black text-blue-600 font-mono leading-none">{seconds}</span>
          <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest leading-none mt-0.5">giây</span>
        </div>
      </div>

      <h3 className="text-base font-black text-slate-800 mb-1">Đang thực thi báo cáo</h3>
      <p className="text-xs text-slate-400 mb-6 font-medium text-center max-w-xs">
        Hệ thống đang tải dữ liệu từ cơ sở dữ liệu bệnh viện. Vui lòng giữ trình duyệt mở.
      </p>

      {/* Progress steps timeline */}
      <div className="w-full max-w-sm bg-slate-50 rounded-2xl p-5 border border-slate-100 flex flex-col gap-3.5 shadow-inner">
        {steps.map((step, idx) => {
          const isCompleted = seconds >= step.activeAt + step.duration;
          const isActive = seconds >= step.activeAt && seconds < step.activeAt + step.duration;
          
          let statusIcon = '⏳';
          let textColor = 'text-slate-400 font-medium';
          let iconClass = 'bg-slate-200 text-slate-400';

          if (isCompleted) {
            statusIcon = '✓';
            textColor = 'text-slate-600 font-semibold';
            iconClass = 'bg-emerald-100 text-emerald-600 font-black';
          } else if (isActive) {
            statusIcon = '🔄';
            textColor = 'text-blue-600 font-bold';
            iconClass = 'bg-blue-100 text-blue-600 animate-spin';
          }

          return (
            <div 
              key={idx} 
              className={`flex items-center gap-3.5 text-xs transition-all duration-300 ${textColor}`}
            >
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${iconClass}`}>
                {statusIcon}
              </span>
              <div className="flex-1 flex items-center justify-between">
                <span>{step.label}</span>
                {isActive && (
                  <span className="font-bold text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse border border-blue-100">
                    đang chạy
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
