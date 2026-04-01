/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  DATE SERVICE — PURE DATE/TIME HANDLING FOR EXCEL EXPORT                 │
 * │                                                                          │
 * │  Tầng này CHỈ chịu trách nhiệm:                                        │
 * │    1. Convert JS Date → Excel serial number                             │
 * │    2. Convert string date → JS Date → serial                            │
 * │    3. Classify numeric values: date serial vs. plain number            │
 * │                                                                          │
 * │  KHÔNG chứa:                                                            │
 * │    • Business logic về recordset hay mapping                            │
 * │    • Type detection heuristics                                          │
 * │    • Excel write logic                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import {
  EXCEL_EPOCH_MS,
  EXCEL_DATE_MIN_SERIAL,
  EXCEL_DATE_MAX_SERIAL,
  CellValueResolution,
  FieldDetectedType,
} from '../models/excel.types.js';

// ─────────────────────────────────────────────
// Excel serial conversion
// ─────────────────────────────────────────────

/**
 * Convert JS Date → Excel serial number.
 *
 * Excel serial = số ngày kể từ Excel epoch (30/12/1899).
 * Dùng UTC để tránh shift do timezone.
 *
 * Ví dụ:
 *   new Date(2024, 0, 1)  → 45292  (01/01/2024)
 *   new Date(2024, 0, 1, 10, 30) → 45292.4375 (01/01/2024 10:30)
 */
export function dateToExcelSerial(date: Date): number {
  return (date.getTime() - EXCEL_EPOCH_MS) / (1000 * 60 * 60 * 24);
}

/**
 * Convert Excel serial → JS Date.
 * Dùng khi cần đọc ngược (hiếm dùng trong export, dùng nhiều trong preview).
 */
export function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_MS + serial * 86400 * 1000);
}

// ─────────────────────────────────────────────
// Date / serial classification
// ─────────────────────────────────────────────

/**
 * Kiểm tra một số có nằm trong range date serial hợp lệ không.
 *
 * Range: 25569 (1970-01-01) → 109205 (2099-12-31).
 *
 * CRITICAL: Đây là cơ sở phân biệt date serial với số thông thường.
 * Số 5, 100, 12345, ... KHÔNG nằm trong range → không phải date.
 */
export function isExcelDateSerial(n: number): boolean {
  return n >= EXCEL_DATE_MIN_SERIAL && n <= EXCEL_DATE_MAX_SERIAL;
}

/**
 * Kiểm tra số có phải là datetime serial (có phần thập phân) không.
 *
 * Chỉ những số:
 *   1. Nằm trong range date serial
 *   2. Có phần thập phân (fractional part)
 * → mới là datetime.
 */
export function isDateTimeSerial(n: number): boolean {
  return isExcelDateSerial(n) && n % 1 !== 0;
}

/**
 * Kiểm tra số có phải là date serial thuần (không có giờ) không.
 *
 * Chỉ những số:
 *   1. Nằm trong range date serial
 *   2. Không có phần thập phân (whole number)
 * → mới là date.
 */
export function isPureDateSerial(n: number): boolean {
  return isExcelDateSerial(n) && n % 1 === 0;
}

/**
 * True nếu giá trị là Date object (từ MSSQL driver).
 */
export function isJSDateObject(val: unknown): val is Date {
  return val instanceof Date && !isNaN(val.getTime());
}

// ─────────────────────────────────────────────
// Format resolution
// ─────────────────────────────────────────────

/**
 * Trả về numFmt string cho một DetectedDataType.
 * KHÔNG convert value — chỉ resolve format.
 */
export function getDateNumFmt(type: FieldDetectedType): string | null {
  switch (type) {
    case 'datetime': return 'dd/MM/yyyy HH:mm:ss';
    case 'date':     return 'dd/MM/yyyy';
    default:          return null;
  }
}

/**
 * Resolve formatKind từ DetectedDataType.
 */
export function getFormatKind(type: FieldDetectedType): 'general' | 'number' | 'date' | 'datetime' | 'text' {
  switch (type) {
    case 'date':     return 'date';
    case 'datetime': return 'datetime';
    case 'number':   return 'number';
    case 'text':     return 'text';
    case 'boolean':  return 'text';
    default:         return 'general';
  }
}

// ─────────────────────────────────────────────
// Value conversion pipeline
// ─────────────────────────────────────────────

/**
 * Convert raw value → CellValueResolution theo type đã biết.
 *
 * Contract:
 *  • date     → serial + numFmt: dd/MM/yyyy
 *  • datetime → serial (giữ phần thập phân) + numFmt: dd/MM/yyyy HH:mm:ss
 *  • number   → giữ nguyên number
 *  • text     → string
 *  • unknown  → string (fallback an toàn)
 *
 * RULES BẮT BUỘC:
 *  • Chỉ JS Date object và serial nằm trong date range mới được convert sang serial.
 *  • Số 5, 100, ... KHÔNG bao giờ bị convert thành date.
 *  • Nếu value không parse được → return text string.
 */
export function convertValueForExcel(
  raw: unknown,
  type: FieldDetectedType
): CellValueResolution {
  if (raw == null) {
    return { excelValue: null, formatKind: 'text', numFmt: null };
  }

  // ── Case: Date object (từ MSSQL driver)
  if (isJSDateObject(raw)) {
    const serial = dateToExcelSerial(raw);
    const hasTime = raw.getHours() !== 0 || raw.getMinutes() !== 0 || raw.getSeconds() !== 0;
    if (hasTime) {
      return { excelValue: serial, formatKind: 'datetime', numFmt: 'dd/MM/yyyy HH:mm:ss' };
    }
    return { excelValue: serial, formatKind: 'date', numFmt: 'dd/MM/yyyy' };
  }

  // ── Case: số (cần phân biệt serial vs. số thường)
  if (typeof raw === 'number' && !isNaN(raw)) {
    // datetime serial → serial + datetime format
    if (isDateTimeSerial(raw)) {
      return { excelValue: raw, formatKind: 'datetime', numFmt: 'dd/MM/yyyy HH:mm:ss' };
    }
    // pure date serial → serial + date format
    if (isPureDateSerial(raw)) {
      return { excelValue: raw, formatKind: 'date', numFmt: 'dd/MM/yyyy' };
    }
    // Số thông thường (STT=5, ID=12345, mã BN=001...) → giữ nguyên
    return { excelValue: raw, formatKind: 'number', numFmt: null };
  }

  // ── Case: string (date string từ user input / param)
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { excelValue: null, formatKind: 'text', numFmt: null };
    }
    // Thử parse string → date
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      // Đây là date string hợp lệ (từ param hoặc kết quả SP dạng string)
      const serial = dateToExcelSerial(parsed);
      // Nếu parse ra date không hợp lệ về mặt Excel (năm < 1970 hoặc > 2099)
      if (!isExcelDateSerial(serial)) {
        return { excelValue: trimmed, formatKind: 'text', numFmt: null };
      }
      const hasTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0 || parsed.getSeconds() !== 0;
      if (hasTime) {
        return { excelValue: serial, formatKind: 'datetime', numFmt: 'dd/MM/yyyy HH:mm:ss' };
      }
      return { excelValue: serial, formatKind: 'date', numFmt: 'dd/MM/yyyy' };
    }
    // String không parse được → giữ nguyên text
    return { excelValue: trimmed, formatKind: 'text', numFmt: null };
  }

  // ── Case: boolean
  if (typeof raw === 'boolean') {
    return { excelValue: raw, formatKind: 'text', numFmt: null };
  }

  // ── Fallback
  return { excelValue: String(raw), formatKind: 'text', numFmt: null };
}
