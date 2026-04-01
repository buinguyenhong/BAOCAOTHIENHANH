import { hospitalDb } from '../config/database.js';
import { SPInfo, SPColumnMetadata, SPParameterMetadata, QueryResult } from '../models/types.js';

const startOfMonth = (d: Date) => {
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

/**
 * Excel serial date: số ngày tính từ 30/12/1899.
 * SQL Server datetime/date → JS Date → serial number → Excel hiểu đúng ngày, không timezone.
 */
function dateToExcelSerial(date: Date): number {
  const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30 00:00:00 UTC
  const diffMs = date.getTime() - EXCEL_EPOCH.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

/** Kiểm tra có phải JS Date object (không phải string hay number) */
function isDateObject(val: unknown): val is Date {
  return val instanceof Date && !isNaN(val.getTime());
}

/** True nếu số là Excel serial date (25569–109205 ≈ 1970-01-01 → 2099-12-31) */
function isExcelSerial(n: number): boolean {
  return n >= 25569 && n <= 109205;
}

/**
 * Detect các cột chứa date serial numbers.
 * Một cột được coi là date nếu >= 80% giá trị non-null là serial dates.
 */
function detectDateColumns(rows: Record<string, any>[]): string[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, 20); // chỉ lấy mẫu 20 dòng đầu
  const dateCols: string[] = [];

  for (const key of Object.keys(rows[0])) {
    const values = sample.map(r => r[key]);
    const nonNull = values.filter(v => v != null);
    if (nonNull.length === 0) continue;
    const dateCount = nonNull.filter(v => typeof v === 'number' && isExcelSerial(v)).length;
    if (dateCount / nonNull.length >= 0.8) {
      dateCols.push(key);
    }
  }
  return dateCols;
}

/**
 * Duyệt tất cả rows trong recordset, thay Date objects bằng Excel serial numbers.
 * Giữ nguyên mọi key/value khác.
 */
function convertDates(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map(row => {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      out[key] = isDateObject(val) ? dateToExcelSerial(val) : val;
    }
    return out;
  });
}

export class HospitalService {
  // Lấy danh sách Stored Procedures
  async listStoredProcedures(): Promise<SPInfo[]> {
    const result = await hospitalDb(`
      SELECT name
      FROM sys.procedures
      WHERE is_ms_shipped = 0
      ORDER BY name
    `);
    return (result.recordset || []).map((r: any) => ({ name: r.name }));
  }

  // Lấy metadata cột trả về của SP
  async getSPColumnMetadata(spName: string): Promise<SPColumnMetadata[]> {
    try {
      const result = await hospitalDb(`
        SELECT
          name,
          system_type_name AS type,
          max_length AS maxLength,
          precision,
          scale,
          is_nullable AS isNullable
        FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(@spName), 0)
        WHERE name IS NOT NULL AND name NOT LIKE '@%'
      `, { spName });

      return (result.recordset || []).map((r: any) => ({
        name: r.name,
        type: r.type,
        maxLength: r.maxLength,
        precision: r.precision,
        scale: r.scale,
        isNullable: r.isNullable,
      }));
    } catch (err: any) {
      console.error('Error getting SP column metadata:', err);
      throw new Error(`Không thể lấy metadata của ${spName}: ${err.message}`);
    }
  }

  // Lấy metadata parameters từ sys.parameters
  async getSPParameterMetadata(spName: string): Promise<SPParameterMetadata[]> {
    try {
      const result = await hospitalDb(`
        SELECT
          p.name,
          t.name AS type,
          p.max_length AS maxLength,
          p.precision,
          p.scale,
          p.is_nullable AS isNullable
        FROM sys.parameters p
        INNER JOIN sys.types t ON p.user_type_id = t.user_type_id
        WHERE p.object_id = OBJECT_ID(@spName) AND p.parameter_id > 0
        ORDER BY p.parameter_id
      `, { spName });

      return (result.recordset || []).map((r: any) => ({
        name: r.name,
        type: r.type,
        maxLength: r.maxLength,
        precision: r.precision,
        scale: r.scale,
        isNullable: r.isNullable,
        hasDefaultValue: false,
      }));
    } catch (err: any) {
      console.error('Error getting SP parameter metadata:', err);
      return [];
    }
  }

  // Test run: auto-detect params, thực thi SP, trả về recordsets
  async testRun(
    spName: string,
    params: Record<string, any>
  ): Promise<{ columns: string[]; rows: Record<string, any>[]; params: SPParameterMetadata[]; recordsets: Record<string, any>[][] }> {
    // Lọc bỏ params có giá trị empty/null/undefined
    const cleanParams: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        cleanParams[k] = v;
      }
    }

    // Auto-set @TuNgay/@DenNgay nếu không có params hợp lệ
    if (Object.keys(cleanParams).length === 0) {
      const spParams = await this.getSPParameterMetadata(spName);
      for (const p of spParams) {
        const n = p.name.toLowerCase();
        if (n.includes('tungay') || n.includes('tunam')) {
          const d = startOfMonth(new Date());
          cleanParams[p.name] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } else if (n.includes('denngay') || n.includes('dennam')) {
          const d = new Date();
          cleanParams[p.name] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
    }

    const result = await this.executeStoredProcedure(spName, cleanParams);
    const spParams = await this.getSPParameterMetadata(spName);

    return {
      columns: result.columns,
      rows: result.rows,
      params: spParams,
      recordsets: result.recordsets || [result.rows],
    };
  }

  // Thực thi SP - hỗ trợ multi-recordsets
  async executeStoredProcedure(
    spName: string,
    params: Record<string, any>
  ): Promise<QueryResult> {
    try {
      const cleanParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          cleanParams[key] = value;
        }
      }

      const result = await hospitalDb(spName, cleanParams, true);

      // MSSQL: result.recordsets = mảng tất cả recordsets
      const rawRecordsets: Record<string, any>[][] = (result as any).recordsets || [result.recordset || []];
      // Chuyển đổi Date objects → Excel serial numbers trước khi trả về
      const allRecordsets = rawRecordsets.map(rs => convertDates(rs));
      const main = allRecordsets[0] || [];

      // Detect date columns từ tất cả recordsets
      const allDateColumns = allRecordsets.flatMap(rs => detectDateColumns(rs));
      // Loại bỏ trùng lặp, giữ thứ tự xuất hiện
      const seen = new Set<string>();
      const dateColumns = allDateColumns.filter(c => {
        const k = c.toUpperCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      if (main.length === 0) {
        return { columns: [], rows: [], recordsets: allRecordsets, dateColumns };
      }

      return {
        columns: Object.keys(main[0]),
        rows: main,
        recordsets: allRecordsets,
        dateColumns,
      };
    } catch (err: any) {
      console.error('Error executing SP:', err);
      throw new Error(`Lỗi thực thi ${spName}: ${err.message}`);
    }
  }
}

export const hospitalService = new HospitalService();
