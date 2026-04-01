/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  EXCEL SERVICE — Export Engine                                            │
 * │                                                                          │
 * │  Architecture: 5 distinct layers, each with a clear contract.            │
 * │                                                                          │
 * │  Layer 1 — Template Resolution                                            │
 * │  Layer 2 — Mapping Resolution   (→ MappingResolutionContext)              │
 * │  Layer 3 — Recordset Lookup     (→ normalized data)                      │
 * │  Layer 4 — Cell Write           (→ CellValueResolution → Excel cell)     │
 * │  Layer 5 — List Block Manager   (first-class BlockContext)                │
 * │                                                                          │
 * │  Data flow:                                                              │
 * │  SP execute → QueryResult + Metadata                                    │
 * │    → resolveMappings() → MappingResolutionContext[]                       │
 * │    → fillParam() / fillScalar() / fillListBlock()                        │
 * │    → writeCell() (pure, stateless)                                       │
 * │    → Excel buffer                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ReportMapping } from '../models/types.js';
import {
  RecordsetMetadata,
  MappingResolutionContext,
  ListBlockContext,
  CellValueResolution,
  CellFormatKind,
} from '../models/excel.types.js';
import {
  convertValueForExcel,
  isJSDateObject,
  dateToExcelSerial,
} from './date.service.js';
import { normalizeRows, getNormalizedParam } from '../utils/normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** numFmt cho Excel general format */
const NUM_FMT_GENERAL = 'General';

/** numFmt standard */
const NUM_FMT_DATE     = 'dd/MM/yyyy';
const NUM_FMT_DATETIME = 'dd/MM/yyyy HH:mm:ss';

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────

/** Parse "A4" → { col: "A", row: 4 } */
function parseCell(addr: string): { col: string; row: number } | null {
  const m = addr.match(/^([a-zA-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: parseInt(m[2], 10) };
}

/** Tạo block key: sheetName|recordsetIndex|startRow */
function blockKey(sheetName: string, recordsetIndex: number, startRow: number): string {
  return `${sheetName}|${recordsetIndex}|${startRow}`;
}

// ─────────────────────────────────────────────
// Layer 2: Mapping Resolution
// ─────────────────────────────────────────────

/**
 * Build FieldTypeMap từ metadata.
 * Map key = "recordsetIndex|FIELDNAME" (uppercase) → FieldDetectedType
 */
function buildFieldTypeMap(metadata: RecordsetMetadata[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const rm of metadata) {
    for (const f of rm.fields) {
      map.set(`${rm.recordsetIndex}|${f.normalizedFieldName}`, f.detectedType);
    }
  }
  return map;
}

/**
 * Resolve type cho một field trong một recordset.
 * Fallback: 'text' nếu không tìm thấy metadata.
 */
function resolveFieldType(
  typeMap: Map<string, string>,
  recordsetIndex: number,
  normalizedFieldName: string
): string {
  return typeMap.get(`${recordsetIndex}|${normalizedFieldName}`) ?? 'text';
}

/**
 * Resolve numFmt từ field type.
 * Chỉ date/datetime mới có numFmt. Number/Text → null.
 */
function resolveNumFmt(type: string): string | null {
  switch (type) {
    case 'datetime': return NUM_FMT_DATETIME;
    case 'date':    return NUM_FMT_DATE;
    default:         return null;
  }
}

/**
 * Resolve MỘT mapping → MappingResolutionContext.
 *
 * Đây là nơi DUY NHẤT quyết định context cho mỗi mapping.
 * Mọi tầng fill sau chỉ nhận context — không tự suy luận.
 */
function resolveMapping(
  mapping: ReportMapping,
  typeMap: Map<string, string>,
  worksheetName: string
): MappingResolutionContext {
  const fieldName = mapping.fieldName ?? '';
  const normalizedFieldName = fieldName.toUpperCase();
  const mappingKind = mapping.mappingType ?? 'scalar';
  const rsIdx = mapping.recordsetIndex ?? 0;

  // Field type: 'param' cho param mapping, lookup từ metadata cho scalar/list
  const fieldType: string =
    mappingKind === 'param'
      ? 'param'
      : resolveFieldType(typeMap, rsIdx, normalizedFieldName);

  const isDate     = fieldType === 'date';
  const isDateTime = fieldType === 'datetime';
  const numFmt    = resolveNumFmt(fieldType);

  return {
    mapping: {
      id: mapping.id ?? '',
      fieldName,
      cellAddress: mapping.cellAddress ?? null,
      mappingType: mappingKind,
      recordsetIndex: mapping.recordsetIndex ?? null,
      sheetName: mapping.sheetName ?? null,
    },
    worksheetName,
    recordsetIndex: mappingKind === 'param' ? null : rsIdx,
    mappingKind,
    fieldName,
    normalizedFieldName,
    fieldType,
    isDate,
    isDateTime,
    numFmt,
  };
}

// ─────────────────────────────────────────────
// Layer 3: Recordset lookup
// ─────────────────────────────────────────────

/**
 * Lấy data cho một recordset index.
 * Fallback an toàn: nếu index vượt quá → lấy recordset[0].
 */
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
// Layer 4: Cell Write (pure, stateless)
// ─────────────────────────────────────────────

/**
 * Convert raw value → CellValueResolution theo context đã resolve.
 *
 * Đây là nơi DUY NHẤT xử lý value coercion.
 * Date/param value cũng đi qua hàm này với type tương ứng.
 */
function resolveCellValue(
  raw: unknown,
  fieldType: string
): CellValueResolution {
  // param luôn là text (string từ user input)
  if (fieldType === 'param') {
    return { excelValue: raw == null ? null : String(raw), formatKind: 'text', numFmt: null };
  }
  // scalar/list: dùng date service với type đã resolve
  return convertValueForExcel(raw, fieldType as any);
}

/**
 * Snapshot style của một cell (trừ numFmt — do caller quản lý).
 */
function snapStyle(cell: ExcelJS.Cell): Record<string, any> {
  const j = (o: any) => (o ? JSON.parse(JSON.stringify(o)) : undefined);
  return {
    font:       j(cell.font),
    border:     j(cell.border),
    fill:       j(cell.fill),
    alignment:  j(cell.alignment),
    protection: j(cell.protection),
    // numFmt intentionally omitted — caller owns it
  };
}

/**
 * Restore style snapshot (trừ numFmt).
 */
function restoreStyle(cell: ExcelJS.Cell, snap: Record<string, any>): void {
  if (snap.font)       cell.font       = snap.font;
  if (snap.border)     cell.border     = snap.border;
  if (snap.fill)       cell.fill       = snap.fill;
  if (snap.alignment)  cell.alignment  = snap.alignment;
  if (snap.protection) cell.protection = snap.protection;
}

/**
 * Ghi một resolved cell value vào Excel cell.
 *
 * Contract rõ ràng:
 *  • Chỉ ghi value + numFmt theo resolution đã tính xong.
 *  • Không suy luận type bên trong hàm này.
 *  • Style được preserve (trừ numFmt).
 *
 * @param cell            Excel cell
 * @param resolution      Kết quả từ resolveCellValue()
 * @param templateCell     Cell template để clone numFmt (nếu không có resolution numFmt)
 */
function writeCell(
  cell: ExcelJS.Cell,
  resolution: CellValueResolution,
  templateCell: ExcelJS.Cell | null
): void {
  const saved = snapStyle(cell);
  cell.value = resolution.excelValue;
  restoreStyle(cell, saved);

  // Apply numFmt: resolution overrides template, template overrides default
  if (resolution.numFmt) {
    cell.numFmt = resolution.numFmt;
  } else if (templateCell && templateCell.numFmt && templateCell.numFmt !== NUM_FMT_GENERAL) {
    cell.numFmt = templateCell.numFmt;
  }
}

/**
 * Clone cell style từ template, sau đó override numFmt.
 */
function applyCellStyle(
  target: ExcelJS.Cell,
  template: ExcelJS.Cell,
  numFmt: string | null
): void {
  const j = (o: any) => (o ? JSON.parse(JSON.stringify(o)) : undefined);
  if (template.font)       target.font       = j(template.font);
  if (template.border)     target.border     = j(template.border);
  if (template.fill)       target.fill       = j(template.fill);
  if (template.alignment)  target.alignment  = j(template.alignment);
  if (template.protection) target.protection = j(template.protection);
  target.numFmt = numFmt ?? (template.numFmt || NUM_FMT_GENERAL);
}

/** Clone row height */
function copyRowHeight(src: ExcelJS.Row, dst: ExcelJS.Row): void {
  if (src.height) dst.height = src.height;
}

// ─────────────────────────────────────────────
// Layer 5: List Block Manager (first-class)
// ─────────────────────────────────────────────

/**
 * ListBlockManager — quản lý block context cho list mapping.
 *
 * CRITICAL INVARIANT:
 *  • Mỗi block được xác định bởi (sheetName|recordsetIndex|startRow).
 *  • rowCount được set lần đầu (từ dòng đầu tiên hit block).
 *  • Mọi cột cùng block dùng CHUNG rowStart + rowCount.
 *  • spliceRows chỉ gọi 1 lần cho mỗi block.
 *  • Data length mismatch → log rõ ràng, cap tại rowCount.
 */
class ListBlockManager {
  private _blocks: Map<string, ListBlockContext> = new Map();

  /** Reset cho mỗi export mới */
  reset(): void {
    this._blocks.clear();
  }

  /**
   * Lấy hoặc tạo block context.
   * Lần đầu gọi: khởi tạo rowCount = data.length.
   * Các lần sau: kiểm tra data.length có khớp không.
   */
  getOrCreate(
    ws: ExcelJS.Worksheet,
    sheetName: string,
    recordsetIndex: number,
    startRow: number,
    dataLength: number
  ): ListBlockContext {
    const bk = blockKey(sheetName, recordsetIndex, startRow);

    if (!this._blocks.has(bk)) {
      // Lần đầu: tạo block với rowCount = data.length
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
      // Các lần sau: kiểm tra alignment
      const existing = this._blocks.get(bk)!;
      if (dataLength !== existing.rowCount) {
        console.warn(
          `[Excel/ListBlock] Alignment mismatch in block "${bk}": ` +
          `this column data.length=${dataLength} ≠ block.rowCount=${existing.rowCount}. ` +
          `Capping at ${existing.rowCount} to maintain column alignment.`
        );
      }
    }

    const ctx = this._blocks.get(bk)!;

    // spliceRows chỉ gọi 1 lần
    if (!ctx.spliced && ctx.rowCount > 1) {
      ws.spliceRows(ctx.rowStart + 1, 0, ...Array(ctx.rowCount - 1).fill(null));
      ctx.spliced = true;
    }

    return ctx;
  }
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

function isValidMapping(m: ReportMapping): boolean {
  if (!m.mappingType) { console.warn(`[Excel] mapping ${m.id} missing mappingType — skip`); return false; }
  if (!m.fieldName)   { console.warn(`[Excel] mapping ${m.id} missing fieldName   — skip`); return false; }
  if (m.mappingType !== 'param' && !m.cellAddress) {
    console.warn(`[Excel] mapping ${m.id} (${m.mappingType}) missing cellAddress — skip`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// ExcelService
// ─────────────────────────────────────────────

export class ExcelService {
  private blocks = new ListBlockManager();

  // ── Template resolution ──────────────────────────────────

  private resolveTemplate(file: string | null): string | null {
    if (!file) return null;
    const p = path.join(TEMPLATES_DIR, file);
    return fs.existsSync(p) ? p : null;
  }

  // ── Worksheet resolution ─────────────────────────────────

  private resolveSheet(wb: ExcelJS.Workbook, sheetName?: string | null): ExcelJS.Worksheet {
    if (sheetName?.trim()) {
      const ws = wb.getWorksheet(sheetName.trim());
      if (ws) return ws;
    }
    if (wb.worksheets.length === 0) return wb.addWorksheet('Report');
    return wb.worksheets[0];
  }

  // ── Layer 2 pre-processing: resolve all mappings ──────────

  /**
   * Resolve TẤT CẢ mappings → MappingResolutionContext[].
   * Mỗi mapping chỉ resolve MỘT lần, dùng chung cho toàn bộ export.
   */
  private resolveAllMappings(
    mappings: ReportMapping[],
    typeMap: Map<string, string>,
    wb: ExcelJS.Workbook
  ): MappingResolutionContext[] {
    const contexts: MappingResolutionContext[] = [];

    for (const m of mappings) {
      if (!isValidMapping(m)) continue;
      const ws = this.resolveSheet(wb, m.sheetName);
      const ctx = resolveMapping(m, typeMap, ws.name);
      contexts.push(ctx);
    }

    // Debug: log resolved contexts
    console.log(`[Excel] Resolved ${contexts.length} mappings:`,
      contexts.map(c => ({
        kind: c.mappingKind,
        field: c.fieldName,
        sheet: c.worksheetName,
        rsIdx: c.recordsetIndex,
        type: c.fieldType,
        cell: c.mapping.cellAddress,
      }))
    );

    return contexts;
  }

  // ── Fill param ────────────────────────────────────────────

  /**
   * Fill param mapping.
   *
   * param: đọc từ params object, KHÔNG đọc từ recordset.
   * Type = 'param' → convertValueForExcel() trả về text string.
   */
  private fillParam(
    ws: ExcelJS.Worksheet,
    ctx: MappingResolutionContext,
    params: Record<string, any>
  ): void {
    if (!ctx.mapping.cellAddress) return;
    const raw = getNormalizedParam(params, ctx.fieldName);
    if (raw == null) return;

    const resolution = resolveCellValue(raw, 'param');
    const cell = ws.getCell(ctx.mapping.cellAddress);
    writeCell(cell, resolution, null);
  }

  // ── Fill scalar ─────────────────────────────────────────

  /**
   * Fill scalar mapping.
   *
   * scalar: đọc từ dòng đầu tiên của recordset đã resolve.
   * Type được resolve từ recordsetMetadata (không tự suy luận).
   */
  private fillScalar(
    ws: ExcelJS.Worksheet,
    ctx: MappingResolutionContext,
    recordsets: Record<string, any>[][]
  ): void {
    if (!ctx.mapping.cellAddress || ctx.recordsetIndex === null) return;

    const data = getRecordsetData(recordsets, ctx.recordsetIndex);
    if (data.length === 0) return;

    const raw = data[0]?.[ctx.normalizedFieldName];
    const resolution = resolveCellValue(raw, ctx.fieldType);
    writeCell(ws.getCell(ctx.mapping.cellAddress), resolution, null);
  }

  // ── Fill list block ──────────────────────────────────────

  /**
   * Fill list mapping.
   *
   * Block semantics:
   *  • rowStart + rowCount được set bởi cột ĐẦU TIÊN hit block.
   *  • Các cột sau reuse block context — rowCount giữ nguyên.
   *  • Data length mismatch → warn + cap tại block.rowCount.
   *  • spliceRows chỉ gọi 1 lần cho mỗi block.
   */
  private fillListBlock(
    ws: ExcelJS.Worksheet,
    ctx: MappingResolutionContext,
    recordsets: Record<string, any>[][]
  ): void {
    if (!ctx.mapping.cellAddress || ctx.recordsetIndex === null) {
      console.warn(`[Excel/fillListBlock] SKIP — no cellAddress or null recordsetIndex: ${ctx.fieldName}`);
      return;
    }

    const parsed = parseCell(ctx.mapping.cellAddress);
    if (!parsed) {
      console.warn(`[Excel/fillListBlock] SKIP — invalid cellAddress: ${ctx.mapping.cellAddress}`);
      return;
    }

    const { col, row: startRow } = parsed;
    const data = getRecordsetData(recordsets, ctx.recordsetIndex);
    console.log(`[Excel/fillListBlock] field="${ctx.fieldName}" sheet="${ctx.worksheetName}" rsIdx=${ctx.recordsetIndex} dataLen=${data.length} cell=${ctx.mapping.cellAddress}`);

    if (data.length === 0) {
      console.warn(`[Excel/fillListBlock] SKIP — no data for recordset ${ctx.recordsetIndex}`);
      return;
    }

    // Lấy hoặc tạo block context
    const b = this.blocks.getOrCreate(
      ws,
      ctx.worksheetName,
      ctx.recordsetIndex,
      startRow,
      data.length
    );

    // Normalize rows cho lookup ổn định
    const normalized = normalizeRows(data);

    // Template cell và row
    const tmplCell = ws.getCell(`${col}${b.templateRow}`);
    const tmplRow  = ws.getRow(b.templateRow);

    // Ghi từng dòng — cap tại block.rowCount
    for (let i = 0; i < b.rowCount; i++) {
      const rowNum = b.rowStart + i;
      const raw = normalized[i]?.[ctx.normalizedFieldName] ?? '';
      const resolution = resolveCellValue(raw, ctx.fieldType);
      const cell = ws.getCell(`${col}${rowNum}`);

      if (i === 0) {
        // Dòng template: preserve style + apply numFmt
        writeCell(cell, resolution, tmplCell);
      } else {
        // Dòng mới: clone template style + apply numFmt
        applyCellStyle(cell, tmplCell, resolution.numFmt);
        cell.value = resolution.excelValue;
        copyRowHeight(tmplRow, ws.getRow(rowNum));
      }
    }
  }

  // ── No-template fallback ─────────────────────────────────

  /**
   * Tạo sheet cơ bản khi không có template.
   * Áp dụng date format cho các field có trong dateColumns (backward compat).
   */
  private fillSheetFallback(
    ws: ExcelJS.Worksheet,
    rows: Record<string, any>[],
    dateColumns: Set<string>
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
        const upper = c.toUpperCase();
        const isDateCol = dateColumns.has(upper);
        const raw = row[c];

        if (isDateCol) {
          // Apply date format trực tiếp trong fallback
          const resolution = convertValueForExcel(raw, 'date');
          writeCell(cell, resolution, null);
        } else {
          cell.value = raw ?? '';
        }
      });
    });
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async exportReport(
    mappings: ReportMapping[],
    templateFile: string | null,
    params: Record<string, any>,
    recordsets: Record<string, any>[][],
    _fileName: string,
    recordsetMetadata?: RecordsetMetadata[]
  ): Promise<Buffer> {
    // Reset per-export state
    this.blocks.reset();

    // ── Layer 1: Build field type map từ metadata
    const typeMap = buildFieldTypeMap(recordsetMetadata ?? []);

    const wb = new ExcelJS.Workbook();

    // ── Load template hoặc tạo fallback
    const tmplPath = this.resolveTemplate(templateFile);
    if (tmplPath) {
      const b64 = fs.readFileSync(tmplPath, 'base64');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wb.xlsx.load as (d: any, o?: any) => Promise<unknown>)(b64, { base64: true });
    } else {
      // No-template: tạo sheet per recordset
      for (let i = 0; i < recordsets.length; i++) {
        const rs = recordsets[i];
        if (!rs?.length) continue;
        const name = i === 0 ? 'Báo cáo' : `Sheet${i + 1}`;
        const dateColSet = new Set<string>();
        const rm = (recordsetMetadata ?? [])[i];
        if (rm) {
          for (const f of rm.fields) {
            if (f.detectedType === 'date' || f.detectedType === 'datetime') {
              dateColSet.add(f.normalizedFieldName);
            }
          }
        }
        this.fillSheetFallback(wb.addWorksheet(name), rs, dateColSet);
      }
      if (!wb.worksheets.length) wb.addWorksheet('Report');
    }

    // ── Layer 2: Resolve ALL mappings once
    const contexts = this.resolveAllMappings(mappings, typeMap, wb);

    // Group by kind
    const paramMappings  = contexts.filter(c => c.mappingKind === 'param');
    const scalarMappings = contexts.filter(c => c.mappingKind === 'scalar');
    const listMappings   = contexts.filter(c => c.mappingKind === 'list');

    // ── Layer 3–4: Fill by kind
    for (const ctx of paramMappings) {
      const ws = this.resolveSheet(wb, ctx.mapping.sheetName);
      this.fillParam(ws, ctx, params);
    }

    for (const ctx of scalarMappings) {
      const ws = this.resolveSheet(wb, ctx.mapping.sheetName);
      this.fillScalar(ws, ctx, recordsets);
    }

    // List blocks: sort by startRow asc (đảm bảo template row được xử lý trước)
    const sortedLists = [...listMappings].sort((a, b) => {
      const ar = parseInt((a.mapping.cellAddress?.match(/\d+/) ?? ['0'])[0]);
      const br = parseInt((b.mapping.cellAddress?.match(/\d+/) ?? ['0'])[0]);
      return ar - br;
    });

    for (const ctx of sortedLists) {
      const ws = this.resolveSheet(wb, ctx.mapping.sheetName);
      this.fillListBlock(ws, ctx, recordsets);
    }

    // ── Serialize
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}

export const excelService = new ExcelService();
