import { hospitalDb } from '../config/database.js';
import {
  SPInfo,
  SPColumnMetadata,
  SPParameterMetadata,
  QueryResult,
  RecordsetMetadata,
  FieldMetadata,
  DetectedDataType,
} from '../models/types.js';

const startOfMonth = (d: Date) => {
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

// ─────────────────────────────────────────────
// Date / serial helpers
// ─────────────────────────────────────────────

/** Excel epoch = 30/12/1899 00:00:00 UTC */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Convert a JS Date (from MSSQL) to an Excel serial number. */
function dateToExcelSerial(date: Date): number {
  return (date.getTime() - EXCEL_EPOCH_MS) / (1000 * 60 * 60 * 24);
}

/** True if a number is a plausible Excel date serial (1970-01-01 → 2099-12-31). */
function isInDateSerialRange(n: number): boolean {
  return n >= 25569 && n <= 109205;
}

/** True if this is a JS Date object (not a string, not a number). */
function isDateObject(val: unknown): val is Date {
  return val instanceof Date && !isNaN(val.getTime());
}

// ─────────────────────────────────────────────
// Value type detection
// ─────────────────────────────────────────────

/**
 * Detect the data type of a field from its actual values (up to 20 rows).
 *
 * Confidence hierarchy:
 *  1. 'datetime' — values with fractional part are unambiguously datetimes.
 *  2. 'date'    — >= 80% of non-null values are in the date serial range AND
 *                 at least 80% of those have no fractional part (whole-number serials).
 *  3. 'number' — at least one non-null value is a plain number outside date range
 *                 or is a small integer.
 *  4. 'text'   — everything else (strings, mixed types).
 *
 * @param rows  Up to 20 sample rows from the recordset.
 * @returns     DetectedDataType for the field.
 */
function detectFieldType(values: unknown[]): DetectedDataType {
  const nonNull = values.filter(v => v != null);
  if (nonNull.length === 0) return 'text';

  // --- Category 1: datetime (has fractional part) ---
  const datetimeCount = nonNull.filter(v => {
    const n = Number(v);
    return typeof v === 'number' && isInDateSerialRange(n) && !isNaN(n) && n % 1 !== 0;
  }).length;
  if (datetimeCount / nonNull.length >= 0.8) return 'datetime';

  // --- Category 2: date (whole-number serials in range) ---
  // These are the trickiest — we rely on the 80% heuristic.
  const serialCount = nonNull.filter(v => {
    const n = Number(v);
    return typeof v === 'number' && isInDateSerialRange(n) && !isNaN(n) && n % 1 === 0;
  }).length;
  if (serialCount / nonNull.length >= 0.8) return 'date';

  // --- Category 3: number (plain numbers) ---
  // A field is a number if it has at least one non-null numeric value.
  const hasNumber = nonNull.some(v => typeof v === 'number' && !isNaN(v));
  if (hasNumber) return 'number';

  // --- Category 4: text (everything else) ---
  return 'text';
}

/**
 * Build RecordsetMetadata for a single recordset.
 * Converts JS Date objects → Excel serial numbers in-place, then detects field types.
 *
 * @param rawRows  Raw rows from MSSQL (may contain Date objects).
 * @param rsIdx    Index of this recordset in the array.
 */
function buildRecordsetMetadata(rawRows: Record<string, any>[], rsIdx: number): {
  converted: Record<string, any>[];
  metadata: RecordsetMetadata;
} {
  // 1. Convert Date objects → Excel serial numbers, build value arrays for detection
  const converted: Record<string, any>[] = [];
  const fieldValueArrays: Record<string, unknown[]> = {};

  for (const row of rawRows) {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      // Collect raw values for type detection BEFORE converting
      if (!(key in fieldValueArrays)) fieldValueArrays[key] = [];
      fieldValueArrays[key].push(val);

      // Convert Date → serial
      out[key] = isDateObject(val) ? dateToExcelSerial(val) : val;
    }
    converted.push(out);
  }

  // 2. Detect type for each field from raw values (before serial conversion)
  const SAMPLE_SIZE = 20;
  const sample = rawRows.slice(0, SAMPLE_SIZE);
  const fields: FieldMetadata[] = Object.keys(rawRows[0] || {}).map(fieldName => ({
    fieldName: fieldName.toUpperCase(),
    detectedType: detectFieldType(sample.map(r => r[fieldName])),
  }));

  return {
    converted,
    metadata: { recordsetIndex: rsIdx, fields },
  };
}

/**
 * Build all RecordsetMetadata for all recordsets.
 * Also populates the legacy `dateColumns` array for backward compat.
 */
function buildAllRecordsetMetadata(
  rawRecordsets: Record<string, any>[][]
): {
  recordsets: Record<string, any>[][];
  recordsetMetadata: RecordsetMetadata[];
  dateColumns: string[];
} {
  const results = rawRecordsets.map((rs, idx) => buildRecordsetMetadata(rs, idx));

  const recordsets = results.map(r => r.converted);
  const recordsetMetadata = results.map(r => r.metadata);

  // Legacy dateColumns: union of all 'date' and 'datetime' field names across recordsets.
  const dateColSet = new Set<string>();
  for (const rm of recordsetMetadata) {
    for (const f of rm.fields) {
      if (f.detectedType === 'date' || f.detectedType === 'datetime') {
        dateColSet.add(f.fieldName.toUpperCase());
      }
    }
  }

  return {
    recordsets,
    recordsetMetadata,
    dateColumns: [...dateColSet],
  };
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

      // MSSQL: result.recordsets = mảng tất cả recordsets (chưa convert)
      const rawRecordsets: Record<string, any>[][] =
        (result as any).recordsets || [result.recordset || []];

      // ── Convert Date objects + build per-recordset field metadata
      const { recordsets, recordsetMetadata, dateColumns } = buildAllRecordsetMetadata(rawRecordsets);
      const main = recordsets[0] || [];

      if (main.length === 0) {
        return { columns: [], rows: [], recordsets, recordsetMetadata, dateColumns };
      }

      return {
        columns: Object.keys(main[0]),
        rows: main,
        recordsets,
        recordsetMetadata,
        dateColumns,
      };
    } catch (err: any) {
      console.error('Error executing SP:', err);
      throw new Error(`Lỗi thực thi ${spName}: ${err.message}`);
    }
  }
}

export const hospitalService = new HospitalService();
