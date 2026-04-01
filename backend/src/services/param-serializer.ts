/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  PARAM SERIALIZER — Deterministic Parameter Serialization                  │
 * │                                                                          │
 * │  Tầng này CHỈ chịu trách nhiệm:                                        │
 * │    1. Serialize user input values → giá trị gửi vào SP                 │
 * │    2. Mỗi ReportParameter có cấu hình rõ:                               │
 * │       • paramType   → loại UI nhập liệu                                  │
 * │       • valueMode   → single / csv / json                                 │
 * │       • options     → static options list                                │
 * │                                                                          │
 * │  KHÔNG chứa:                                                            │
 * │    • Business logic                                                     │
 * │    • Excel export logic                                                 │
 * │    • Type detection heuristics                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { ReportParameter, ParamOption } from '../models/types.js';
import { normalizeParamName } from '../utils/normalize.js';

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

/**
 * Serialize Date object hoặc string → chuỗi định dạng YYYY-MM-DD.
 * Dùng chuẩn để gửi vào MSSQL stored procedure.
 */
export function serializeDateValue(value: unknown): string {
  if (!value) return '';

  // Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // String — chuẩn hóa: nếu là ngày hợp lệ thì format lại
  const s = String(value).trim();
  if (!s) return '';

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // String không parse được → trả nguyên (đã format sẵn)
  return s;
}

/**
 * Serialize DateTime object hoặc string → chuỗi định dạng YYYY-MM-DD HH:mm:ss.
 */
export function serializeDateTimeValue(value: unknown): string {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    const hh = String(value.getHours()).padStart(2, '0');
    const mm = String(value.getMinutes()).padStart(2, '0');
    const ss = String(value.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  const s = String(value).trim();
  if (!s) return '';

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    const ss = String(parsed.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  return s;
}

// ─────────────────────────────────────────────
// Value normalization (before serialization)
// ─────────────────────────────────────────────

/**
 * Normalize user input value về string/array phù hợp với cấu hình param.
 */
function normalizeInputValue(
  rawValue: unknown,
  paramType: string
): string | string[] {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return '';
  }

  // Array (multi-select từ frontend)
  if (Array.isArray(rawValue)) {
    return rawValue.map(v => String(v).trim()).filter(Boolean);
  }

  // String có chứa dấu phẩy → có thể là CSV
  if (typeof rawValue === 'string' && rawValue.includes(',')) {
    return rawValue.split(',').map(v => v.trim()).filter(Boolean);
  }

  // Single value
  const s = String(rawValue).trim();
  return s;
}

// ─────────────────────────────────────────────
// Core serialization
// ─────────────────────────────────────────────

/**
 * Serialize MỘT giá trị theo paramType.
 */
function serializeByParamType(
  value: string | string[],
  paramType: string
): string {
  const isEmpty = !value || (Array.isArray(value) && value.length === 0);
  if (isEmpty) return '';

  const single = Array.isArray(value) ? value[0] : value;

  switch (paramType) {
    case 'date':
      return serializeDateValue(single);

    case 'datetime':
      return serializeDateTimeValue(single);

    case 'number': {
      const n = Number(single);
      return isNaN(n) ? single : String(n);
    }

    case 'select':
    case 'multiselect':
    case 'text':
    case 'textarea':
    default:
      return single;
  }
}

/**
 * Serialize GIÁ TRỊ ĐÃ CHỌN theo valueMode.
 *
 *  • single  → gửi 1 giá trị duy nhất
 *  • csv      → join array bằng dấu phẩy
 *  • json     → stringify JSON array
 */
function serializeByValueMode(
  values: string | string[],
  valueMode: string
): string {
  // Empty
  if (!values) return '';

  // Single value → just serialize
  if (!Array.isArray(values) || values.length === 0) {
    return String(values);
  }

  switch (valueMode) {
    case 'csv':
      return values.join(',');

    case 'json':
      return JSON.stringify(values);

    case 'single':
    default:
      // Chỉ lấy giá trị đầu tiên
      return values[0];
  }
}

// ─────────────────────────────────────────────
// Main API
// ─────────────────────────────────────────────

/**
 * Serialize một tham số báo cáo từ user input → giá trị gửi vào SP.
 *
 * Data flow:
 *   rawInput (string | string[] | Date)
 *     → normalizeInputValue()
 *     → serializeByParamType()
 *     → serializeByValueMode()
 *     → final string
 *
 * Quy tắc:
 *  • date/datetime luôn serialize về chuỗi chuẩn YYYY-MM-DD / YYYY-MM-DD HH:mm:ss
 *  • number serialize về string số
 *  • multiselect: valueMode=csv → "1,2,3", valueMode=json → '[1,2,3]'
 *  • empty/null/undefined → ""
 *
 * @param param    Cấu hình tham số (từ report.parameters)
 * @param rawValue Giá trị user nhập (từ request body/query)
 * @returns        Giá trị đã serialize để gửi vào MSSQL
 */
export function serializeParamValue(
  param: ReportParameter,
  rawValue: unknown
): string {
  // Normalize input
  const normalized = normalizeInputValue(rawValue, param.paramType);

  // Empty → return empty
  if (!normalized || (Array.isArray(normalized) && normalized.length === 0)) {
    return '';
  }

  // Serialize by paramType
  const byType = serializeByParamType(normalized, param.paramType);

  // Serialize by valueMode
  return serializeByValueMode(
    Array.isArray(normalized) ? normalized : byType,
    param.valueMode ?? 'single'
  );
}

/**
 * Serialize TẤT CẢ params của một report từ request body.
 *
 * @param reportParams  Danh sách cấu hình tham số (từ report.parameters)
 * @param rawParams     Object chứa user input values
 * @returns              Object đã serialize theo cấu hình
 */
export function serializeReportParams(
  reportParams: ReportParameter[],
  rawParams: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};

  // Build normalized lookup map từ rawParams MỘT LẦN:
  // mọi biến thể @TuNgay / TuNgay / tungay / TUNGAY → key chuẩn TUNGAY
  const normalizedLookup: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    normalizedLookup[normalizeParamName(k)] = v;
  }

  for (const param of reportParams) {
    // Lấy value bằng key chuẩn hóa của param
    const paramKey = normalizeParamName(param.paramName);
    const rawValue = normalizedLookup[paramKey];

    const serialized = serializeParamValue(param, rawValue ?? '');
    // Chỉ thêm vào result nếu có giá trị
    if (serialized !== '') {
      result[param.paramName] = serialized;
    }
  }

  return result;
}

/**
 * Lấy default value đã serialize cho một param.
 */
export function getSerializedDefaultValue(param: ReportParameter): string {
  if (param.defaultValue === null || param.defaultValue === undefined || param.defaultValue === '') return '';
  return serializeParamValue(param, param.defaultValue);
}
