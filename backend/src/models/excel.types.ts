/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  EXCEL EXPORT — SHARED CONTRACT LAYER                                    │
 * │                                                                          │
 * │  Tầng này định nghĩa tất cả interface dùng chung giữa:                  │
 * │    • metadata layer  (hospital.service)                                  │
 * │    • resolution layer (excel-export service — pre-fill)                    │
 * │    • write layer    (excel-export service — actual fill)                  │
 * │                                                                          │
 * │  KHÔNG chứa logic xử lý. Chỉ chứa type và hằng số.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ─────────────────────────────────────────────
// Mapping value type for export (nguồn sự thật)
// ─────────────────────────────────────────────

/**
 * Loại giá trị quyết định cách convert khi export.
 * ĐÂY LÀ NGUỒN SỰ THẬT DUY NHẤT cho export.
 * KHÔNG dùng heuristic từ data runtime.
 */
export type MappingValueType = 'text' | 'number' | 'date' | 'datetime';

// ─────────────────────────────────────────────
// 4.1 — Query metadata layer (from MSSQL result)
// ─────────────────────────────────────────────

/**
 * Loại kiểu thực tế phát hiện từ dữ liệu — theo từng field trong từng recordset.
 */
export type FieldDetectedType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'unknown';

/**
 * Metadata cho một field TRONG một recordset cụ thể.
 * Đây là kết quả phân tích dữ liệu thực tế — không phải schema.
 */
export interface FieldMetadata {
  /** Tên field gốc */
  fieldName: string;
  /** Tên viết HOA — dùng làm lookup key ổn định */
  normalizedFieldName: string;
  /** Kiểu phát hiện từ data thực tế */
  detectedType: FieldDetectedType;
}

/**
 * Metadata cho một recordset cụ thể.
 * Mỗi recordset có danh sách field riêng — không chia sẻ.
 */
export interface RecordsetMetadata {
  recordsetIndex: number;
  /** Danh sách field, thứ tự = thứ tự cột trong recordset */
  fields: FieldMetadata[];
}

/**
 * Tất cả metadata sau khi execute SP.
 * Chứa metadata cho MỌI recordset.
 */
export interface QueryExecutionMetadata {
  recordsets: RecordsetMetadata[];
}

// ─────────────────────────────────────────────
// 4.2 — Mapping resolution layer (pre-fill context)
// ─────────────────────────────────────────────

/** 3 loại mapping theo nguồn dữ liệu */
export type MappingKind = 'param' | 'scalar' | 'list';

/**
 * Context đã resolve đầy đủ CHO MỘT mapping TRƯỚC KHI fill Excel.
 *
 * Mọi quyết định format/numFmt phải dựa trên context này.
 * KHÔNG suy luận thêm trong lúc fill cell.
 */
export interface MappingResolutionContext {
  /** Mapping gốc */
  mapping: {
    id: string;
    fieldName: string;
    cellAddress: string | null;
    mappingType: 'param' | 'scalar' | 'list';
    recordsetIndex: number | null;
    sheetName: string | null;
  };
  /** Sheet thực tế sẽ ghi */
  worksheetName: string;
  /** Recordset index — chỉ dùng cho scalar/list; null cho param */
  recordsetIndex: number | null;
  /** Loại mapping */
  mappingKind: MappingKind;
  /** Tên field gốc */
  fieldName: string;
  /** Tên field viết HOA — dùng lookup key */
  normalizedFieldName: string;
  /** Kiểu field trong recordset tương ứng — 'param' cho param mapping */
  fieldType: string;
  /** true nếu là date thuần (serial nguyên) */
  isDate: boolean;
  /** true nếu là datetime (serial có phần thập phân) */
  isDateTime: boolean;
  /** Format Excel áp dụng — null nếu không cần format đặc biệt */
  numFmt: string | null;
}

// ─────────────────────────────────────────────
// 4.3 — Value conversion layer
// ─────────────────────────────────────────────

/** Loại format cho Excel */
export type CellFormatKind = 'general' | 'number' | 'date' | 'datetime' | 'text';

/**
 * Kết quả convert raw value → giá trị sẵn sàng ghi vào Excel.
 *
 * Contract rõ ràng:
 *  • excelValue  → giá trị ghi vào cell
 *  • formatKind  → loại format để apply
 *  • numFmt      → chuỗi numFmt cụ thể
 *
 * Write layer CHỈ nhận kết quả này — không tự suy luận type.
 */
export interface CellValueResolution {
  /** Giá trị sẽ ghi vào Excel cell */
  excelValue: string | number | boolean | null;
  /** Loại format — dùng để quyết định numFmt */
  formatKind: CellFormatKind;
  /** Chuỗi numFmt cụ thể — 'general' nếu không cần format */
  numFmt: string | null;
}

// ─────────────────────────────────────────────
// 4.5 — List block layer
// ─────────────────────────────────────────────

/**
 * Context cho một list block.
 *
 * Block = một vùng dữ liệu list trên một sheet.
 * Key = sheetName + recordsetIndex + startRow.
 *
 * BẮT BUỘC:
 *  • Mọi cột cùng block phải dùng cùng rowStart, rowCount.
 *  • spliceRows chỉ gọi ĐÚNG 1 LẦN cho mỗi block.
 *  • Không tracking row riêng từng cột.
 */
export interface ListBlockContext {
  blockKey: string;
  /** Sheet name */
  sheetName: string;
  /** Recordset index */
  recordsetIndex: number;
  /** Dòng bắt đầu (dòng template — dòng 1 của block) */
  rowStart: number;
  /** Số dòng data — DÙNG CHUNG cho mọi cột */
  rowCount: number;
  /** Dòng template để clone style */
  templateRow: number;
  /** Đã gọi spliceRows chưa? */
  spliced: boolean;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Số dòng mẫu dùng để detect type (20 dòng đầu) */
export const TYPE_DETECTION_SAMPLE_SIZE = 20;

/** Excel epoch: 30/12/1899 00:00:00 UTC (chuẩn Excel dùng để tránh timezone shift) */
export const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * Range hợp lệ cho Excel date serial: 25569 (1970-01-01) → 109205 (2099-12-31)
 * Dùng để phân biệt date serial với số thông thường.
 */
export const EXCEL_DATE_MIN_SERIAL = 25569;
export const EXCEL_DATE_MAX_SERIAL = 109205;
