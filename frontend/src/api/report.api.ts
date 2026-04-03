import api from './client';
import type {
  ApiResponse,
  Report,
  QueryResult,
  SPMetadata,
  SPInfo,
  ConnectionStatus,
  ReportParameter,
  ReportMapping,
  ReportGroup,
} from '../types';

// USER endpoints
export const reportApi = {
  // Lấy danh sách báo cáo của user
  getMyReports: async (): Promise<ApiResponse<Report[]>> => {
    const res = await api.get<ApiResponse<Report[]>>('/user/reports');
    return res.data;
  },

  // Lấy chi tiết báo cáo
  getReport: async (id: string): Promise<ApiResponse<Report>> => {
    const res = await api.get<ApiResponse<Report>>(`/user/reports/${id}`);
    return res.data;
  },

  // Chạy báo cáo
  executeReport: async (id: string, params: Record<string, any>): Promise<ApiResponse<QueryResult>> => {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value));
      }
    }
    const res = await api.get<ApiResponse<QueryResult>>(
      `/user/reports/${id}/execute?${queryParams.toString()}`
    );
    return res.data;
  },

  // Export Excel
  exportReport: async (
    id: string,
    queryResult: { recordsets: any[][] },
    params: Record<string, any>
  ): Promise<Blob> => {
    const res = await api.post<any>(
      `/user/reports/${id}/export`,
      { recordsets: queryResult.recordsets, params },
      { responseType: 'blob' }
    );
    return res.data;
  },
};

// ADMIN endpoints
export const adminReportApi = {
  getAllReports: async (): Promise<ApiResponse<Report[]>> => {
    const res = await api.get<ApiResponse<Report[]>>('/reports');
    return res.data;
  },

  getReportGroups: async (): Promise<ApiResponse<ReportGroup[]>> => {
    const res = await api.get<ApiResponse<ReportGroup[]>>('/report-groups');
    return res.data;
  },

  createReport: async (report: Partial<Report>): Promise<ApiResponse<Report>> => {
    const res = await api.post<ApiResponse<Report>>('/reports', report);
    return res.data;
  },

  updateReport: async (id: string, report: Partial<Report>): Promise<ApiResponse<Report>> => {
    const res = await api.put<ApiResponse<Report>>(`/reports/${id}`, report);
    return res.data;
  },

  deleteReport: async (id: string): Promise<ApiResponse> => {
    const res = await api.delete<ApiResponse>(`/reports/${id}`);
    return res.data;
  },

  updateParameters: async (id: string, parameters: ReportParameter[]): Promise<ApiResponse> => {
    const res = await api.put<ApiResponse>(`/reports/${id}/parameters`, { parameters });
    return res.data;
  },

  updateMappings: async (id: string, mappings: ReportMapping[]): Promise<ApiResponse> => {
    const res = await api.put<ApiResponse>(`/reports/${id}/mappings`, { mappings });
    return res.data;
  },

  uploadTemplate: async (id: string, file: File): Promise<ApiResponse> => {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const res = await api.post<ApiResponse>(`/reports/${id}/template`, {
            fileName: file.name,
            fileData: base64,
          });
          resolve(res.data);
        } catch (err: any) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  getTemplateSheets: async (reportId: string): Promise<ApiResponse<string[]>> => {
    const res = await api.get<ApiResponse<string[]>>(`/reports/${reportId}/template/sheets`);
    return res.data;
  },

  /** Lấy options động cho param có optionsSourceType='sql' */
  getParamOptions: async (reportId: string, paramId: string): Promise<ApiResponse<Array<{ value: string; label: string }>>> => {
    const res = await api.get<ApiResponse<Array<{ value: string; label: string }>>>(
      `/reports/${reportId}/parameters/options?paramId=${paramId}`
    );
    return res.data;
  },
};

// SYSTEM endpoints
export const systemApi = {
  getStoredProcedures: async (): Promise<ApiResponse<SPInfo[]>> => {
    const res = await api.get<ApiResponse<SPInfo[]>>('/system/stored-procedures');
    return res.data;
  },

  getSPMetadata: async (spName: string): Promise<ApiResponse<SPMetadata>> => {
    const res = await api.get<ApiResponse<SPMetadata>>(`/system/sp-metadata/${encodeURIComponent(spName)}`);
    return res.data;
  },

  testRun: async (spName: string, params: Record<string, any>): Promise<ApiResponse<{ columns: string[]; rows: any[]; params: any[]; recordsets: any[][] }>> => {
    const res = await api.post<ApiResponse<{ columns: string[]; rows: any[]; params: any[]; recordsets: any[][] }>>('/system/sp-metadata/test-run', { spName, params });
    return res.data;
  },

  getConnectionStatus: async (): Promise<ApiResponse<ConnectionStatus>> => {
    const res = await api.get<ApiResponse<ConnectionStatus>>('/system/connection-status');
    return res.data;
  },

  setupConnection: async (config: {
    server: string;
    database: string;
    user: string;
    password: string;
    queryTimeout?: number;
  }): Promise<ApiResponse> => {
    const res = await api.post<ApiResponse>('/system/setup-connection', config);
    return res.data;
  },
};
