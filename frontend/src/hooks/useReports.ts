import React, { useState, useCallback, useMemo } from 'react';
import { reportApi } from '../api/report.api';
import type { Report, QueryResult, ReportGroup } from '../types';

export const useReports = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMyReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportApi.getMyReports();
      if (res.success && res.data) {
        setReports(res.data);
      } else {
        setError(res.error || 'Không thể tải danh sách báo cáo');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  }, []);

  const executeReport = useCallback(async (id: string, params: Record<string, any>): Promise<QueryResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportApi.executeReport(id, params);
      if (res.success && res.data) {
        return res.data;
      } else {
        setError(res.error || 'Lỗi thực thi báo cáo');
        return null;
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Lỗi kết nối';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const exportReport = useCallback(async (id: string, queryResult: { recordsets: any[][] }, params: Record<string, any>, fileName: string) => {
    setLoading(true);
    try {
      const blob = await reportApi.exportReport(id, queryResult, params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'report.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Lỗi xuất file';
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Group reports by groupName
  const reportGroups: ReportGroup[] = useMemo(() => {
    const map = new Map<string, Report[]>();
    reports.forEach((r) => {
      const key = r.groupName || 'Khác';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).map(([name, reports]) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      icon: reports[0]?.groupIcon || '📂',
      reports,
    }));
  }, [reports]);

  return {
    reports,
    reportGroups,
    loading,
    error,
    fetchMyReports,
    executeReport,
    exportReport,
  };
};
