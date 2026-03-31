/**
 * Utility: Chuẩn hóa tham số SP và row keys.
 * Dùng chung cho toàn bộ backend.
 */

/**
 * Chuẩn hóa tên tham số: @TuNgay → TuNgay, TuNgay → TuNgay, tungay → TuNgay.
 * Luôn strip @ prefix khi bind xuống MSSQL.
 * Hỗ trợ đồng thời @TuNgay, TuNgay, tungay, TUNGAY.
 */
export function normalizeParamName(paramName: string): string {
  let name = paramName.trim();
  if (name.startsWith('@')) {
    name = name.slice(1);
  }
  return name.toUpperCase();
}

/**
 * Tạo map: tất cả các biến thể (@TuNgay, TuNgay, tungay, TUNGAY) → key ổn định.
 * Key ổn định = uppercase, không @, trim.
 *
 * Ví dụ:
 *   buildParamLookup({ '@TuNgay': '2024-01-01', TuNgay: '2024-01-01' })
 *   → { 'TUNGAY': '2024-01-01' }
 */
export function buildParamLookup(
  rawParams: Record<string, any>
): Record<string, any> {
  const lookup: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    lookup[normalizeParamName(k)] = v;
  }
  return lookup;
}

/**
 * Lấy giá trị từ params sau khi normalize.
 * Hỗ trợ: @fieldName, fieldName, FIELDNAME.
 * Nếu không tìm thấy → trả về undefined.
 */
export function getNormalizedParam(
  rawParams: Record<string, any>,
  fieldName: string
): any {
  const lookup = buildParamLookup(rawParams);
  return lookup[normalizeParamName(fieldName)];
}

/**
 * Normalize toàn bộ query string thành map dạng { paramNameUpper: value }.
 * Dùng ở execute route trước khi map theo report.parameters.
 *
 * Ví dụ request query:
 *   ?@TuNgay=2024-01-01&DenNgay=2024-01-31&tungay=2024-01-01
 * → { 'TUNGAY': '2024-01-01', 'DENNGAY': '2024-01-31' }
 */
export function normalizeQueryParams(
  query: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') {
      result[normalizeParamName(k)] = v;
    }
  }
  return result;
}

/**
 * Normalize row keys sang uppercase để lookup ổn định.
 * Luôn bỏ qua case khi truy cập field name.
 *
 * Ví dụ: { 'MaBN': '001', 'ten': 'Nguyễn Văn A' }
 * → { 'MABN': '001', 'TEN': 'Nguyễn Văn A' }
 */
export function normalizeRow(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    normalized[k.toUpperCase()] = v;
  }
  return normalized;
}

/**
 * Normalize mảng rows.
 */
export function normalizeRows(
  rows: Record<string, any>[]
): Record<string, any>[] {
  return rows.map(normalizeRow);
}

/**
 * Lấy giá trị từ row đã normalize theo field name (case-insensitive).
 * Không fallback sang row khác.
 */
export function getRowValue(
  normalizedRows: Record<string, any>[],
  fieldName: string,
  rowIndex: number = 0
): any {
  const row = normalizedRows[rowIndex];
  if (!row) return undefined;
  return row[fieldName.toUpperCase()];
}
