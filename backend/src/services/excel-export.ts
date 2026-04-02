/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  EXCEL EXPORT — Deterministic Export Engine                              │
 * │                                                                          │
 * │  NGUYÊN TẮC SẮT BRA:                                                    │
 * │  mapping.valueType LÀ NGUỒN SỰ THẬT DUY NHẤT cho export.                  │
 * │                                                                          │
 * │  KHÔNG CÒN:                                                            │
 * │    • Heuristic detect type từ data runtime                             │
 * │    • SmartType tự đoán                                                 │
 * │    • dateColumns global                                                 │
 * │    • Bất kỳ logic nào phụ thuộc vào dữ liệu ngẫu nhiên               │
 * │                                                                          │
 * │  Architecture (3 tầng rõ ràng):                                       │
 * │                                                                          │
 * │  Layer 1 — Load & Setup                                                │
 * │    • Load template / create fallback sheets                             │
 * │    • Build FieldTypeMap (keyed by recordsetIndex|fieldName)            │
 * │                                                                          │
 * │  Layer 2 — Resolve & Convert                                           │
 * │    • resolveMappingContext() → per-mapping resolved context             │
 * │    • convertForExport() → CellValueResolution                           │
 * │                                                                          │
 * │  Layer 3 — Write                                                       │
 * │    • writeCell() — pure, stateless                                     │
 * │    • fillParam() / fillScalar() / fillListBlock()                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ReportMapping } from '../models/types.js';
import { MappingValueType } from '../models/excel.types.js';
import {
  RecordsetMetadata,
  ListBlockContext,
  CellValueResolution,
  EXCEL_EPOCH_MS,
} from '../models/excel.types.js';
import { normalizeRows, normalizeRow, getNormalizedParam } from '../utils/normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const NUM_FMT_GENERAL = 'General';
const NUM_FMT_DATE    = 'dd/MM/yyyy';
const NUM_FMT_DATETIME = 'dd/MM/yyyy HH:mm:ss';

// ─────────────────────────────────────────────
// Date / Serial utilities (pure, no heuristic)
// ─────────────────────────────────────────────

/** Convert JS Date → Excel serial number */
function dateToExcelSerial(date: Date): number {
  return (date.getTime() - EXCEL_EPOCH_MS) / (1000 * 60 * 60 * 24);
}

/** True if value is a JS Date object */
function isDateObject(val: unknown): val is Date {
  return val instanceof Date && !isNaN(val.getTime());
}

/** Parse date/datetime string → Date or null */
function parseDateString(s: string): Date | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────
// Layer 2: Value Conversion
// ─────────────────────────────────────────────

/**
 * NGUỒN SỰ THẬT: convert giá trị theo mapping.valueType.
 *
 * RULES TUYỆT ĐỐI (theo valueType):
 *
 *  'text':
 *    → luôn ghi string, không ép date, không ép number
 *    → null/undefined → ""
 *
 *  'number':
 *    → parse hợp lệ → number
 *    → không apply date format BAO GIỜ
 *    → BenhAn_Id=5 → 5 (number), không phải 05/01/1900
 *    → null/undefined → ""
 *
 *  'date':
 *    → input: Date object / serial / string date
 *    → normalize → Excel serial + numFmt='dd/MM/yyyy'
 *    → formatPattern override nếu có
 *
 *  'datetime':
 *    → input: Date object / serial / string datetime
 *    → normalize → Excel serial + numFmt='dd/MM/yyyy HH:mm:ss'
 *    → formatPattern override nếu có
 *
 *  null (backward compat):
 *    → fallback an toàn: 'text' cho param, 'text' cho scalar/list
 */
function convertForExport(
  raw: unknown,
  valueType: MappingValueType | null | undefined,
  formatPattern: string | null | undefined
): CellValueResolution {
  if (raw == null || raw === '') {
    return { excelValue: null, formatKind: 'general', numFmt: null };
  }

  const override = formatPattern ?? null;

  switch (valueType) {
    case 'date': {
      const numFmt = override ?? NUM_FMT_DATE;
      // Date object
      if (isDateObject(raw)) {
        return { excelValue: dateToExcelSerial(raw), formatKind: 'date', numFmt };
      }
      // Excel serial number
      if (typeof raw === 'number' && !isNaN(raw)) {
        return { excelValue: raw, formatKind: 'date', numFmt };
      }
      // Date string
      const d = parseDateString(String(raw));
      if (d) return { excelValue: dateToExcelSerial(d), formatKind: 'date', numFmt };
      // Cannot parse → fallback text
      return { excelValue: String(raw), formatKind: 'text', numFmt: null };
    }

    case 'datetime': {
      const numFmt = override ?? NUM_FMT_DATETIME;
      if (isDateObject(raw)) {
        return { excelValue: dateToExcelSerial(raw), formatKind: 'datetime', numFmt };
      }
      if (typeof raw === 'number' && !isNaN(raw)) {
        return { excelValue: raw, formatKind: 'datetime', numFmt };
      }
      const d = parseDateString(String(raw));
      if (d) return { excelValue: dateToExcelSerial(d), formatKind: 'datetime', numFmt };
      return { excelValue: String(raw), formatKind: 'text', numFmt: null };
    }

    case 'number': {
      const n = Number(raw);
      if (!isNaN(n)) {
        return { excelValue: n, formatKind: 'number', numFmt: null };
      }
      return { excelValue: String(raw), formatKind: 'text', numFmt: null };
    }

    case 'text':
    case null:
    case undefined:
    default:
      return { excelValue: String(raw), formatKind: 'text', numFmt: null };
  }
}

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────

/** Parse "A4" → { col: "A", row: 4 } */
function parseCell(addr: string): { col: string; row: number } | null {
  const m = addr.match(/^([a-zA-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: parseInt(m[2], 10) };
}

/** Block key: sheetName|recordsetIndex|startRow */
function blockKey(sheetName: string, recordsetIndex: number, startRow: number): string {
  return `${sheetName}|${recordsetIndex}|${startRow}`;
}

// ─────────────────────────────────────────────
// Layer 3: Cell Write (pure, stateless)
// ─────────────────────────────────────────────

/** Snapshot style (trừ numFmt) */
function snapStyle(cell: ExcelJS.Cell): Record<string, any> {
  const j = (o: any) => (o ? JSON.parse(JSON.stringify(o)) : undefined);
  return {
    font:       j(cell.font),
    border:     j(cell.border),
    fill:       j(cell.fill),
    alignment:  j(cell.alignment),
    protection: j(cell.protection),
  };
}

/** Restore style (trừ numFmt) */
function restoreStyle(cell: ExcelJS.Cell, snap: Record<string, any>): void {
  if (snap.font)       cell.font       = snap.font;
  if (snap.border)   cell.border    = snap.border;
  if (snap.fill)      cell.fill      = snap.fill;
  if (snap.alignment) cell.alignment = snap.alignment;
  if (snap.protection) cell.protection = snap.protection;
}

/**
 * Ghi resolved value vào cell.
 * Contract rõ: chỉ ghi theo resolution, không suy luận.
 */
function writeCell(
  cell: ExcelJS.Cell,
  resolution: CellValueResolution,
  templateCell: ExcelJS.Cell | null
): void {
  const saved = snapStyle(cell);
  cell.value = resolution.excelValue;
  restoreStyle(cell, saved);
  if (resolution.numFmt) {
    cell.numFmt = resolution.numFmt;
  } else if (templateCell?.numFmt && templateCell.numFmt !== NUM_FMT_GENERAL) {
    cell.numFmt = templateCell.numFmt;
  }
}

/** Clone style từ template + override numFmt */
function applyCellStyle(
  target: ExcelJS.Cell,
  template: ExcelJS.Cell,
  numFmt: string | null
): void {
  const j = (o: any) => (o ? JSON.parse(JSON.stringify(o)) : undefined);
  if (template.font)       target.font       = j(template.font);
  if (template.border)    target.border     = j(template.border);
  if (template.fill)      target.fill       = j(template.fill);
  if (template.alignment)  target.alignment = j(template.alignment);
  if (template.protection) target.protection = j(template.protection);
  target.numFmt = numFmt ?? (template.numFmt || NUM_FMT_GENERAL);
}

/** Clone row height */
function copyRowHeight(src: ExcelJS.Row, dst: ExcelJS.Row): void {
  if (src.height) dst.height = src.height;
}

// ─────────────────────────────────────────────
// List Block Manager (first-class)
// ─────────────────────────────────────────────

/**
 * Quản lý block context cho list mapping.
 * INVARIANT:
 *  • Mỗi block = (sheetName|recordsetIndex|startRow)
 *  • rowCount = số dòng data — DÙNG CHUNG cho mọi cột
 *  • spliceRows gọi đúng 1 lần
 *  • Data mismatch → log + cap
 */
class ListBlockManager {
  private _blocks = new Map<string, ListBlockContext>();

  reset(): void {
    this._blocks.clear();
  }

  getOrCreate(
    ws: ExcelJS.Worksheet,
    sheetName: string,
    recordsetIndex: number,
    startRow: number,
    dataLength: number
  ): ListBlockContext {
    const bk = blockKey(sheetName, recordsetIndex, startRow);

    if (!this._blocks.has(bk)) {
      this._blocks.set(bk, {
        blockKey: bk,
        sheetName,
        recordsetIndex,
        rowStart:    startRow,
        rowCount:   dataLength,
        templateRow: startRow,
        spliced:    false,
      });
    } else {
      const existing = this._blocks.get(bk)!;
      if (dataLength !== existing.rowCount) {
        console.warn(
          `[Excel/Block] "${bk}": data.length=${dataLength} ≠ block.rowCount=${existing.rowCount}. ` +
          `Capping at ${existing.rowCount}.`
        );
      }
    }

    const ctx = this._blocks.get(bk)!;

    // spliceRows — gọi đúng 1 lần
    if (!ctx.spliced && ctx.rowCount > 1) {
      ws.spliceRows(ctx.rowStart + 1, 0, ...Array(ctx.rowCount - 1).fill(null));
      ctx.spliced = true;
    }

    return ctx;
  }
}

// ─────────────────────────────────────────────
// Recordset lookup
// ─────────────────────────────────────────────

function getRecordsetData(
  recordsets: Record<string, any>[][],
  recordsetIndex: number
): Record<string, any>[] {
  if (recordsetIndex >= 0 && recordsetIndex < recordsets.length) {
    return recordsets[recordsetIndex];
  }
  return recordsets[0] ?? [];
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

function isValidMapping(m: ReportMapping): boolean {
  if (!m.mappingType) return false;
  if (!m.fieldName) return false;
  if (m.mappingType !== 'param' && !m.cellAddress) return false;
  return true;
}

// ─────────────────────────────────────────────
// ExcelExportService
// ─────────────────────────────────────────────

export class ExcelExportService {
  private blocks = new ListBlockManager();

  // ── Template resolution ──────────────────────

  private resolveTemplate(file: string | null): string | null {
    if (!file) return null;
    const p = path.join(TEMPLATES_DIR, file);
    return fs.existsSync(p) ? p : null;
  }

  private resolveSheet(wb: ExcelJS.Workbook, sheetName?: string | null): ExcelJS.Worksheet {
    if (sheetName?.trim()) {
      const ws = wb.getWorksheet(sheetName.trim());
      if (ws) {
        console.log(`[Excel] resolveSheet('${sheetName}') → found '${ws.name}'`);
        return ws;
      }
      console.log(`[Excel] resolveSheet('${sheetName}') → NOT FOUND, fallback to first sheet`);
    }
    if (wb.worksheets.length === 0) return wb.addWorksheet('Report');
    const fallback = wb.worksheets[0];
    console.log(`[Excel] resolveSheet('${sheetName ?? '(null)'}') → fallback to '${fallback.name}'`);
    return fallback;
  }

  // ── Layer 1: Build field type map from metadata ──

  /**
   * Build field type map cho export.
   * Key = "recordsetIndex|FIELDNAME", Value = valueType string.
   *
   * CHỈ dùng cho SCALAR/LIST khi không có mapping.valueType.
   * param mapping KHÔNG bao giờ dùng map này.
   */
  private buildFieldTypeMap(
    recordsetMetadata?: RecordsetMetadata[]
  ): Map<string, string> {
    const map = new Map<string, string>();
    for (const rm of recordsetMetadata ?? []) {
      for (const f of rm.fields) {
        map.set(
          `${rm.recordsetIndex}|${f.normalizedFieldName}`,
          f.detectedType
        );
      }
    }
    return map;
  }

  /**
   * Resolve valueType cho MỘT mapping.
   * Priority:
   *  1. mapping.valueType (config rõ ràng) → DÙNG
   *  2. fieldTypeMap lookup (backward compat) → chỉ cho scalar/list
   *  3. fallback an toàn:
   *       param → 'text'
   *       scalar/list → 'text'
   */
  private resolveValueType(
    mapping: ReportMapping,
    fieldTypeMap: Map<string, string>
  ): MappingValueType {
    // 1. Config rõ ràng
    if (mapping.valueType) return mapping.valueType;

    // 2. Fallback: lookup từ metadata (backward compat)
    if (mapping.mappingType !== 'param') {
      const rsIdx = mapping.recordsetIndex ?? 0;
      const key = `${rsIdx}|${(mapping.fieldName ?? '').toUpperCase()}`;
      const detected = fieldTypeMap.get(key);
      if (detected && ['text', 'number', 'date', 'datetime'].includes(detected)) {
        return detected as MappingValueType;
      }
    }

    // 3. Safe fallback
    return 'text';
  }

  // ── Fill param ─────────────────────────────

  /**
   * param mapping: lấy từ params object, KHÔNG từ recordset.
   * Type: 'text' — params là string từ user input.
   */
  private fillParam(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    params: Record<string, string>
  ): void {
    if (!mapping.cellAddress) return;
    const raw = getNormalizedParam(params, mapping.fieldName);
    if (raw == null) return;

    const valueType = this.resolveValueType(mapping, new Map());
    const resolution = convertForExport(raw, valueType, mapping.formatPattern ?? null);
    writeCell(ws.getCell(mapping.cellAddress), resolution, null);
  }

  // ── Fill scalar ─────────────────────────────

  /**
   * scalar mapping: lấy 1 giá trị từ dòng đầu recordset.
   * Row phải normalize trước khi lookup vì MSSQL trả mixed-case keys
   * (vd: BenhAn_Id, TongSoCaNhapVien, NgayVaoVien).
   */
  private fillScalar(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    recordsets: Record<string, any>[][],
    fieldTypeMap: Map<string, string>
  ): void {
    if (!mapping.cellAddress) return;
    const rsIdx = mapping.recordsetIndex ?? 0;
    const data = getRecordsetData(recordsets, rsIdx);
    if (data.length === 0) {
      console.log('[Excel] fillScalar ' + mapping.fieldName + '@' + mapping.cellAddress + ' -> SKIP (data empty, rsIdx=' + rsIdx + ')');
      return;
    }

    const normalizedField = (mapping.fieldName ?? '').toUpperCase();
    // BUG FIX: normalize row keys trước lookup — giống fillListBlock
    const normalizedRow = normalizeRow(data[0]);
    const raw = normalizedRow[normalizedField];
    console.log('[Excel] fillScalar ' + mapping.fieldName + '@' + mapping.cellAddress
      + ' -> raw=' + JSON.stringify(raw)
      + ' | rowKeys(gốc)=' + Object.keys(data[0]).join(',')
      + ' | normalizedKey=' + normalizedField);
    const valueType = this.resolveValueType(mapping, fieldTypeMap);
    const resolution = convertForExport(raw, valueType, mapping.formatPattern ?? null);
    writeCell(ws.getCell(mapping.cellAddress), resolution, null);
  }

  // ── Fill list block ─────────────────────────

  /**
   * list mapping: ghi nhiều dòng.
   * Block semantics: rowCount dùng CHUNG, spliceRows gọi 1 LẦN.
   */
  private fillListBlock(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    recordsets: Record<string, any>[][],
    fieldTypeMap: Map<string, string>
  ): void {
    if (!mapping.cellAddress) return;
    const rsIdx = mapping.recordsetIndex ?? 0;
    const data = getRecordsetData(recordsets, rsIdx);
    if (data.length === 0) {
      console.log('[Excel] fillList ' + mapping.fieldName + '@' + mapping.cellAddress + ' -> SKIP (data empty, rsIdx=' + rsIdx + ')');
      return;
    }

    const parsed = parseCell(mapping.cellAddress);
    if (!parsed) return;

    const { col, row: startRow } = parsed;
    const wsName = ws.name;

    const valueType = this.resolveValueType(mapping, fieldTypeMap);
    const b = this.blocks.getOrCreate(ws, wsName, rsIdx, startRow, data.length);
    const normalized = normalizeRows(data);

    const tmplCell = ws.getCell(`${col}${b.templateRow}`);
    const tmplRow  = ws.getRow(b.templateRow);

    for (let i = 0; i < b.rowCount; i++) {
      const rowNum = b.rowStart + i;
      const raw = normalized[i]?.[(mapping.fieldName ?? '').toUpperCase()] ?? '';
      const resolution = convertForExport(raw, valueType, mapping.formatPattern ?? null);
      const cell = ws.getCell(`${col}${rowNum}`);

      if (i === 0) {
        writeCell(cell, resolution, tmplCell);
      } else {
        applyCellStyle(cell, tmplCell, resolution.numFmt);
        cell.value = resolution.excelValue;
        copyRowHeight(tmplRow, ws.getRow(rowNum));
      }
    }
  }

  // ── No-template fallback ─────────────────────

  private fillSheetFallback(
    ws: ExcelJS.Worksheet,
    rows: Record<string, any>[],
    fieldTypeMap: Map<string, string>
  ): void {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);

    // Header
    cols.forEach((c, i) => {
      const cell = ws.getCell(1, i + 1);
      cell.value = c;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    });

    // Data
    rows.forEach((row, ri) => {
      cols.forEach((c, ci) => {
        const cell = ws.getCell(ri + 2, ci + 1);
        const key = `0|${c.toUpperCase()}`;
        const valueType = (fieldTypeMap.get(key) ?? 'text') as MappingValueType;
        const resolution = convertForExport(row[c], valueType, null);
        writeCell(cell, resolution, null);
      });
    });
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  /**
   * Export report to Excel buffer.
   *
   * @param mappings          Danh sách mapping từ DB
   * @param templateFile     Đường dẫn template
   * @param params           Params đã serialize (string)
   * @param recordsets       Data từ SP
   * @param _fileName        Tên file (để tương lai)
   * @param recordsetMetadata Metadata kiểu (dùng cho backward compat fallback)
   */
  async exportReport(
    mappings: ReportMapping[],
    templateFile: string | null,
    params: Record<string, string>,
    recordsets: Record<string, any>[][],
    _fileName: string,
    recordsetMetadata?: RecordsetMetadata[]
  ): Promise<Buffer> {
    this.blocks.reset();

    // ── Layer 1: Build type map
    const fieldTypeMap = this.buildFieldTypeMap(recordsetMetadata);

    const wb = new ExcelJS.Workbook();

    // ── Load template hoặc fallback
    const tmplPath = this.resolveTemplate(templateFile);
    if (tmplPath) {
      const b64 = fs.readFileSync(tmplPath, 'base64');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wb.xlsx.load as (d: any, o?: any) => Promise<unknown>)(b64, { base64: true });
      console.log(`[Excel] template loaded: ${tmplPath}`);
      console.log(`[Excel] sheets in template: [${wb.worksheets.map(ws => ws.name).join(', ')}]`);
    } else {
      // No template: tạo sheet per recordset
      for (let i = 0; i < recordsets.length; i++) {
        const rs = recordsets[i];
        if (!rs?.length) continue;
        const name = i === 0 ? 'Báo cáo' : `Sheet${i + 1}`;
        this.fillSheetFallback(wb.addWorksheet(name), rs, fieldTypeMap);
      }
      if (!wb.worksheets.length) wb.addWorksheet('Report');
    }

    // ── Group mappings by kind
    const validMappings = mappings.filter(isValidMapping);
    console.log('[Excel] templateFile=' + (templateFile ?? 'null') + ' tmplPath=' + (tmplPath ?? 'null'));
    const mappingDebug = validMappings.map(m => m.fieldName + '@' + (m.sheetName ?? '') + '[rs' + (m.recordsetIndex ?? 0) + ']').join(' | ');
    console.log('[Excel] mappings: ' + mappingDebug);
    console.log('[Excel] recordsets: ' + recordsets.map((rs, i) => 'RS' + i + '=' + rs.length + 'rows').join(', '));
    const paramMappings  = validMappings.filter(m => m.mappingType === 'param');
    const scalarMappings = validMappings.filter(m => m.mappingType === 'scalar');
    const listMappings   = validMappings.filter(m => m.mappingType === 'list');

    // ── Fill param
    for (const m of paramMappings) {
      const ws = this.resolveSheet(wb, m.sheetName);
      this.fillParam(ws, m, params);
    }

    // ── Fill scalar
    for (const m of scalarMappings) {
      const ws = this.resolveSheet(wb, m.sheetName);
      this.fillScalar(ws, m, recordsets, fieldTypeMap);
    }

    // ── Fill list: sort by startRow asc
    const sorted = [...listMappings].sort((a, b) => {
      const ar = parseInt((a.cellAddress?.match(/\d+/) ?? ['0'])[0]);
      const br = parseInt((b.cellAddress?.match(/\d+/) ?? ['0'])[0]);
      return ar - br;
    });

    for (const m of sorted) {
      const ws = this.resolveSheet(wb, m.sheetName);
      this.fillListBlock(ws, m, recordsets, fieldTypeMap);
    }

    // ── Serialize
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}

export const excelExportService = new ExcelExportService();
