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
 * Serialize Date object hoặc string → chuỗi định dạng YYYY-MM-DD (UTC).
 *
 * FIX Timezone: Luôn dùng UTC methods để tránh lệch 0.7 ngày.
 * Server bệnh viện chạy local time (VN = UTC+7).
 * VD: '2024-01-01' parse as local → getDate() có thể trả về '2023-12-31'
 * khi input là '2024-01-01T00:00:00Z'. Dùng UTC methods đảm bảo
 * ngày gửi vào SP luôn đúng với ngày thực tế.
 */
export function serializeDateValue(value: unknown): string {
  if (!value) return '';

  // Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // String — chuẩn hóa: nếu là ngày hợp lệ thì format lại
  const s = String(value).trim();
  if (!s) return '';

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // String không parse được → trả nguyên (đã format sẵn)
  return s;
}

/**
 * Serialize DateTime object hoặc string → chuỗi định dạng YYYY-MM-DD HH:mm:ss (UTC).
 *
 * FIX Timezone: Dùng UTC methods tương tự serializeDateValue.
 * Đảm bảo giờ server bệnh viện không bị lệch ±7 tiếng so với input.
 */
export function serializeDateTimeValue(value: unknown): string {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    const hh = String(value.getUTCHours()).padStart(2, '0');
    const mm = String(value.getUTCMinutes()).padStart(2, '0');
    const ss = String(value.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  const s = String(value).trim();
  if (!s) return '';

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    const hh = String(parsed.getUTCHours()).padStart(2, '0');
    const mm = String(parsed.getUTCMinutes()).padStart(2, '0');
    const ss = String(parsed.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  return s;
}

// ─────────────────────────────────────────────
// Value normalization (before serialization)
// ─────────────────────────────────────────────

/**
 * Normalize user input value về string/array phù hợp với cấu hình param.
 *
 * FIX: Chỉ split khi paramType === 'multiselect' HOẶC input là array.
 * Tránh làm hỏng chuỗi có dấu phẩy (VD: địa chỉ "Hà Nội, Việt Nam").
 *
 * - Array từ frontend (multi-select) → luôn split → string[]
 * - 'multiselect' param string → split comma → string[]
 * - 'text'/'textarea' param string → GIỮ NGUYÊN, không split
 * - single value → string
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

  // FIX: Chỉ split comma khi là multiselect param.
  // 'text'/'textarea' giữ nguyên string dù có dấu phẩy.
  if (typeof rawValue === 'string' && rawValue.includes(',')) {
    if (paramType === 'multiselect') {
      return rawValue.split(',').map(v => v.trim()).filter(Boolean);
    }
    // Non-multiselect: giữ nguyên string
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

  // FIX Double-serialize: Nếu normalized là array, serialize TỪNG PHẦN TỬ
  // theo paramType TRƯỚC KHI đưa vào serializeByValueMode.
  // Trước đây: normalized=['2024-01-01','2024-01-31'] → byType='2024-01-01' (sai!)
  // Bây giờ:   normalized=['2024-01-01','2024-01-31'] → ['2024-01-01','2024-01-31'] đúng
  if (Array.isArray(normalized)) {
    const serialized = normalized.map(el => serializeByParamType(el, param.paramType));
    return serializeByValueMode(serialized, param.valueMode ?? 'single');
  }

  // Scalar case: serialize theo paramType
  const byType = serializeByParamType(normalized, param.paramType);
  return serializeByValueMode(byType, param.valueMode ?? 'single');
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
