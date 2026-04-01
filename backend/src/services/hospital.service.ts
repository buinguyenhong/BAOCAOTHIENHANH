/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  HOSPITAL SERVICE — Query execution + METADATA LAYER                      │
 * │                                                                          │
 * │  Tầng này chịu trách nhiệm:                                            │
 * │    1. Execute stored procedure                                          │
 * │    2. Convert Date objects → Excel serial numbers                        │
 * │    3. Detect field types PER RECORDSET (metadata resolution)             │
 * │    4. Trả về QueryResult đầy đủ + metadata                             │
 * │                                                                          │
 * │  KHÔNG chứa:                                                            │
 * │    • Mapping resolution                                                  │
 * │    • Excel write logic                                                  │
 * │    • numFmt application                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { hospitalDb } from '../config/database.js';
import {
  SPInfo,
  SPColumnMetadata,
  SPParameterMetadata,
  QueryResult,
} from '../models/types.js';
import {
  RecordsetMetadata,
  FieldMetadata,
  FieldDetectedType,
  QueryExecutionMetadata,
  TYPE_DETECTION_SAMPLE_SIZE,
} from '../models/excel.types.js';
import {
  isDateTimeSerial,
  isPureDateSerial,
  isJSDateObject,
  dateToExcelSerial,
} from './date.service.js';

// ─────────────────────────────────────────────
// Type detection
// ─────────────────────────────────────────────

/**
 * Phát hiện kiểu thực tế của một field từ dữ liệu mẫu (20 dòng đầu).
 *
 * RULES PHÁT HIỆN (theo thứ tự ưu tiên):
 *
 *  1. 'datetime' (HIGHEST PRIORITY)
 *     ≥80% giá trị là datetime serial (nằm trong range + có phần thập phân)
 *     → datetime serial có tính đặc thù cao, không nhầm được với số thường.
 *
 *  2. 'date'
 *     ≥80% giá trị là date serial (nằm trong range + không có phần thập phân)
 *     → Date serial thuần — dùng 80% threshold để tránh miss khi có NULL/mixed.
 *
 *  3. 'number'
 *     Có ít nhất 1 giá trị là number hợp lệ KHÔNG nằm trong date serial range.
 *     → STT, ID, mã BN, số tiền, v.v.
 *
 *  4. 'text'
 *     Tất cả các trường hợp còn lại (string, mixed, NULL, v.v.)
 *
 * CƠ SỞ HEURISTIC:
 *  • 80% threshold cho date/datetime: tránh miss khi data có NULL hoặc vài row lạ.
 *  • Chỉ những số nằm NGOÀI date serial range (25569–109205) mới là 'number'.
 *  • Số 5, 100, 12345 → nằm ngoài range → 'number' ✓
 *  • Số 45000–55000 (khoảng 2023–2050) → nằm trong range → có thể là date
 *
 * @param values    Mảng giá trị (từ sample rows, có thể chứa null)
 * @param fieldName Tên field — dùng để gợi ý type nếu data ambiguous
 */
function detectFieldType(values: unknown[], fieldName: string): FieldDetectedType {
  const nonNull = values.filter(v => v != null);
  if (nonNull.length === 0) return 'text';

  const upperField = fieldName.toUpperCase();

  // ── Skip date detection for fields clearly NOT dates ──
  // Field có tên suggest không phải date → chỉ detect number/text
  const NOT_DATE_FIELDS = ['STT', 'MA', 'ID', 'NO', 'SO', 'NAM', 'TUOI', 'DIENTHOAI', 'SDT', 'EMAIL', 'DIA_CHI', 'DCHI', 'CMND', 'CCCD'];
  const clearlyNotDate = NOT_DATE_FIELDS.some(k => upperField.includes(k));
  if (clearlyNotDate) {
    const hasNumber = nonNull.some(v => typeof v === 'number' && !isNaN(v));
    return hasNumber ? 'number' : 'text';
  }

  // ── Category 1: datetime serial (fractional date serials) ──
  // datetime serial = nằm trong range + có phần thập phân
  const datetimeCount = nonNull.filter(v => {
    if (typeof v !== 'number' || isNaN(v)) return false;
    return isDateTimeSerial(v);
  }).length;
  if (datetimeCount / nonNull.length >= 0.8) return 'datetime';

  // ── Category 2: pure date serial (whole number date serials) ──
  // Chỉ detect date khi có tên field gợi ý (tránh false positive)
  const DATE_SUGGESTIVE_NAMES = ['NGAY', 'DATE', 'TIME', 'GIO', 'GIOI', 'TU', 'DEN', 'BD', 'KT', 'VAO', 'RA', 'SINH', 'HAN', 'HET', 'HEN', 'DANGKY', 'DK'];
  const suggestiveField = DATE_SUGGESTIVE_NAMES.some(k => upperField.includes(k));

  const serialCount = nonNull.filter(v => {
    if (typeof v !== 'number' || isNaN(v)) return false;
    return isPureDateSerial(v);
  }).length;
  const serialRatio = nonNull.length > 0 ? serialCount / nonNull.length : 0;

  if (suggestiveField && serialRatio >= 0.8) return 'date';
  if (serialRatio >= 0.9) return 'date'; // 90%+ là serial → chắc chắn là date dù tên gì

  // ── Category 3: number (plain numbers, not date serials) ──
  // A field is 'number' if it has at least one non-null numeric value
  // AND the numeric values are NOT primarily date serials
  const hasNumber = nonNull.some(v => typeof v === 'number' && !isNaN(v));
  if (hasNumber) return 'number';

  // ── Category 4: text (strings, mixed, boolean, null) ──
  return 'text';
}

// ─────────────────────────────────────────────
// Metadata builder
// ─────────────────────────────────────────────

/**
 * Build RecordsetMetadata cho MỘT recordset.
 *
 * Steps:
 *  1. Collect raw values per field (cho type detection).
 *  2. Convert Date objects → Excel serial numbers.
 *  3. Detect type cho mỗi field.
 *
 * @param rawRows  Raw rows từ MSSQL (có thể chứa Date objects)
 * @param rsIdx    Index của recordset
 */
function buildRecordsetMetadata(
  rawRows: Record<string, any>[],
  rsIdx: number
): { converted: Record<string, any>[]; metadata: RecordsetMetadata } {
  if (!rawRows || rawRows.length === 0) {
    return { converted: [], metadata: { recordsetIndex: rsIdx, fields: [] } };
  }

  const fieldNames = Object.keys(rawRows[0]);

  // Bước 1: Collect raw values + convert Date → serial (1 pass)
  const fieldValueArrays: Record<string, unknown[]> = {};
  const converted: Record<string, any>[] = [];

  for (const row of rawRows) {
    const out: Record<string, any> = {};
    for (const key of fieldNames) {
      const val = row[key];

      // Collect raw values BEFORE conversion
      if (!(key in fieldValueArrays)) fieldValueArrays[key] = [];
      fieldValueArrays[key].push(val);

      // Convert Date → Excel serial
      out[key] = isJSDateObject(val)
        ? dateToExcelSerial(val)
        : val;
    }
    converted.push(out);
  }

  // Bước 2: Detect type cho mỗi field từ raw values (trước serial conversion)
  const sampleSize = Math.min(TYPE_DETECTION_SAMPLE_SIZE, rawRows.length);
  const sample = rawRows.slice(0, sampleSize);

  const fields: FieldMetadata[] = fieldNames.map(fieldName => {
    const sampleValues = sample.map(r => r[fieldName]);
    return {
      fieldName,
      normalizedFieldName: fieldName.toUpperCase(),
      detectedType: detectFieldType(sampleValues, fieldName),
    };
  });

  return {
    converted,
    metadata: { recordsetIndex: rsIdx, fields },
  };
}

/**
 * Build metadata cho TẤT CẢ recordsets.
 * Trả về cả data đã convert.
 *
 * BACKWARD COMPAT: Cũng tạo legacy `dateColumns` (global string[])
 * để client cũ vẫn hoạt động.
 */
function buildAllRecordsetMetadata(
  rawRecordsets: Record<string, any>[][]
): {
  recordsets: Record<string, any>[][];
  recordsetMetadata: RecordsetMetadata[];
  executionMetadata: QueryExecutionMetadata;
  /** Legacy — chỉ dùng cho backward compat */
  dateColumns: string[];
} {
  const results = rawRecordsets.map((rs, idx) => buildRecordsetMetadata(rs, idx));

  const recordsets = results.map(r => r.converted);
  const recordsetMetadata = results.map(r => r.metadata);
  const executionMetadata: QueryExecutionMetadata = { recordsets: recordsetMetadata };

  // Legacy: union tất cả date/datetime field names
  const dateColSet = new Set<string>();
  for (const rm of recordsetMetadata) {
    for (const f of rm.fields) {
      if (f.detectedType === 'date' || f.detectedType === 'datetime') {
        dateColSet.add(f.normalizedFieldName);
      }
    }
  }

  return {
    recordsets,
    recordsetMetadata,
    executionMetadata,
    dateColumns: [...dateColSet],
  };
}

// ─────────────────────────────────────────────
// HospitalService
// ─────────────────────────────────────────────

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
  ): Promise<{
    columns: string[];
    rows: Record<string, any>[];
    params: SPParameterMetadata[];
    recordsets: Record<string, any>[][];
  }> {
    const cleanParams: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        cleanParams[k] = v;
      }
    }

    // Auto-set @TuNgay/@DenNgay
    if (Object.keys(cleanParams).length === 0) {
      const spParams = await this.getSPParameterMetadata(spName);
      for (const p of spParams) {
        const n = p.name.toLowerCase();
        if (n.includes('tungay') || n.includes('tunam')) {
          const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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

  /**
   * Thực thi stored procedure.
   *
   * Kết quả trả về:
   *  • rows          — dòng đầu tiên của recordset[0] (legacy compat)
   *  • recordsets    — tất cả recordsets (đã convert Date → serial)
   *  • columns       — tên cột của recordset[0]
   *  • recordsetMetadata — metadata kiểu TỪNG RECORDSET (nguồn thật cho export)
   *  • executionMetadata — wrapper chuẩn hóa
   *  • dateColumns   — legacy global list (backward compat)
   */
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

      // MSSQL: result.recordsets = mảng tất cả recordsets (raw — Date objects chưa convert)
      const rawRecordsets: Record<string, any>[][] =
        (result as any).recordsets || [result.recordset || []];

      // ── Build metadata + convert data
      const { recordsets, recordsetMetadata, executionMetadata, dateColumns } =
        buildAllRecordsetMetadata(rawRecordsets);

      const main = recordsets[0] || [];

      if (main.length === 0) {
        return {
          columns: [],
          rows: [],
          recordsets,
          recordsetMetadata,
          executionMetadata,
          dateColumns,
        };
      }

      return {
        columns: Object.keys(main[0]),
        rows: main,
        recordsets,
        recordsetMetadata,
        executionMetadata,
        dateColumns,
      };
    } catch (err: any) {
      console.error('Error executing SP:', err);
      throw new Error(`Lỗi thực thi ${spName}: ${err.message}`);
    }
  }
}

export const hospitalService = new HospitalService();
