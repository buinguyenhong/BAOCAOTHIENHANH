/**
 * Excel Service — Export Engine
 *
 * Architecture (4 clean layers):
 *
 *  ┌─ exportReport() ──────────────────────────────────────────────────────┐
 *  │  1. Load workbook / create sheets                                    │
 *  │  2. Build FieldTypeMap      ← keyed by "recordsetIndex|fieldName"   │
 *  │  3. Fill param  → fillParam()                                        │
 *  │  4. Fill scalar → fillScalar()                                      │
 *  │  5. Fill list   → fillBlock()                                       │
 *  │  6. Serialize buffer                                                │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  FieldTypeMap:
 *    key = `${recordsetIndex}|${fieldName}`   (both uppercase)
 *    value = DetectedDataType ('text' | 'number' | 'date' | 'datetime')
 *
 *  Value pipeline per cell:
 *    raw value
 *      ↓ resolveFieldType(fieldKey, recordsetIndex, typeMap)
 *    DetectedDataType
 *      ↓ convertForExcel(value, detectedType)
 *    { value: string|number, numFmt: string|null }
 *      ↓ writeCell(cell, { value, numFmt }, styleTemplate?)
 *    Excel cell (formatted)
 *
 *  Block tracker (shared across all columns in same block):
 *    key  = `${sheetName}|${recordsetIndex}|${startRow}`
 *    state = { spliced, rowStart, rowCount, templateRow }
 *    All columns write to the same row range — perfectly aligned.
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ReportMapping,
  RecordsetMetadata,
  DetectedDataType,
} from '../models/types.js';
import { normalizeRows, getNormalizedParam } from '../utils/normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Fully resolved info for writing a cell. */
interface ResolvedValue {
  value: string | number;
  /** null means "don't touch numFmt" (preserve template or default) */
  numFmt: string | null;
}

interface BlockState {
  /** Has spliceRows been called for this block already? */
  spliced: boolean;
  /** First data row for this block (same for all columns) */
  rowStart: number;
  /** Number of data rows (same for all columns — alignment guarantee) */
  rowCount: number;
  /** Template row to clone style from */
  templateRow: number;
}

// ─────────────────────────────────────────────
// Block key
// ─────────────────────────────────────────────

function blockKey(sheetName: string, recordsetIndex: number, startRow: number): string {
  return `${sheetName}|${recordsetIndex}|${startRow}`;
}

// ─────────────────────────────────────────────
// Cell helpers
// ─────────────────────────────────────────────

/** Parse "A4" → { col: "A", row: 4 } */
function parseCell(addr: string): { col: string; row: number } | null {
  const m = addr.match(/^([a-zA-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: parseInt(m[2], 10) };
}

/** Snapshot style (everything except numFmt — caller owns numFmt). */
function snapStyle(cell: ExcelJS.Cell): Record<string, any> {
  const j = (o: any) => (o ? JSON.parse(JSON.stringify(o)) : undefined);
  return {
    font:      j(cell.font),
    border:    j(cell.border),
    fill:      j(cell.fill),
    alignment: j(cell.alignment),
    protection: j(cell.protection),
    // NOTE: numFmt is intentionally omitted — it is set by the value pipeline.
  };
}

/** Restore style, skipping numFmt. */
function restoreStyle(cell: ExcelJS.Cell, snap: Record<string, any>): void {
  if (snap.font)      cell.font      = snap.font;
  if (snap.border)    cell.border    = snap.border;
  if (snap.fill)      cell.fill      = snap.fill;
  if (snap.alignment)  cell.alignment = snap.alignment;
  if (snap.protection) cell.protection = snap.protection;
}

/** Clone row height from template. */
function copyRowHeight(src: ExcelJS.Row, dst: ExcelJS.Row): void {
  if (src.height) dst.height = src.height;
}

/** Clone cell style from template, then override numFmt if provided. */
function applyCellStyle(
  target: ExcelJS.Cell,
  template: ExcelJS.Cell,
  numFmt: string | null
): void {
  const j = (o: any) => (o ? JSON.parse(JSON.stringify(o)) : undefined);
  if (template.font)      target.font      = j(template.font);
  if (template.border)    target.border    = j(template.border);
  if (template.fill)      target.fill      = j(template.fill);
  if (template.alignment)  target.alignment = j(template.alignment);
  target.numFmt = numFmt ?? (template.numFmt || 'General');
  if (template.protection) target.protection = j(template.protection);
}

// ─────────────────────────────────────────────
// Recordset / field metadata helpers
// ─────────────────────────────────────────────

/**
 * Build a flat lookup map from "recordsetIndex|fieldName" → DetectedDataType.
 *
 * This is the single source of truth for type decisions during export.
 * Resolved at export time from the recordsetMetadata array.
 */
function buildFieldTypeMap(metadata: RecordsetMetadata[]): Map<string, DetectedDataType> {
  const map = new Map<string, DetectedDataType>();
  for (const rm of metadata) {
    for (const f of rm.fields) {
      map.set(`${rm.recordsetIndex}|${f.fieldName.toUpperCase()}`, f.detectedType);
    }
  }
  return map;
}

/** Resolve recordset data by index, with fallback. */
function resolveRecordset(
  recordsets: Record<string, any>[][],
  recordsetIndex: number | null | undefined
): Record<string, any>[] {
  const idx = recordsetIndex ?? 0;
  return (idx >= 0 && idx < recordsets.length) ? recordsets[idx] : (recordsets[0] ?? []);
}

// ─────────────────────────────────────────────
// Value conversion (the value pipeline)
// ─────────────────────────────────────────────

/**
 * Convert a raw value for Excel using the resolved DetectedDataType.
 *
 * Rules:
 *  - 'number':   coerce to Number if possible; string IDs (>6 digits, starts with 0) stay as text.
 *  - 'date':      coerce to Number (Excel serial); Excel will display as date via numFmt.
 *  - 'datetime':  coerce to Number (serial with fraction); numFmt will add time part.
 *  - 'text':      return as-is; numFmt = null (don't touch cell formatting).
 *
 *  This is the ONLY place where value coercion happens. smartType decisions are
 *  fully context-driven by the field's detected type.
 */
function convertForExcel(raw: unknown, type: DetectedDataType): ResolvedValue {
  if (raw == null) return { value: '', numFmt: null };

  switch (type) {
    case 'datetime': {
      // Excel serial + time portion → dd/MM/yyyy hh:mm:ss
      const n = Number(raw);
      return { value: isNaN(n) ? String(raw) : n, numFmt: 'dd/MM/yyyy hh:mm:ss' };
    }
    case 'date': {
      // Excel serial, whole number → dd/MM/yyyy
      const n = Number(raw);
      return { value: isNaN(n) ? String(raw) : n, numFmt: 'dd/MM/yyyy' };
    }
    case 'number': {
      // Coerce to number following standard rules
      const s = String(raw).trim();
      if (s !== '' && !isNaN(Number(raw)) && s.length < 15 && !s.startsWith('0') && !/^\d{6,}$/.test(s)) {
        return { value: Number(raw), numFmt: null };
      }
      return { value: s, numFmt: null };
    }
    case 'text':
    default:
      return { value: String(raw), numFmt: null };
  }
}

/** Write a resolved value + numFmt to a cell, preserving all other styles. */
function writeResolved(
  cell: ExcelJS.Cell,
  rv: ResolvedValue,
  templateCell: ExcelJS.Cell | null
): void {
  const snap = snapStyle(cell);
  cell.value = rv.value;
  restoreStyle(cell, snap);
  if (rv.numFmt) {
    cell.numFmt = rv.numFmt;
  } else if (templateCell) {
    // For non-date cells: clone template numFmt so numbers behave consistently
    if (!cell.numFmt || cell.numFmt === 'General') {
      cell.numFmt = templateCell.numFmt || 'General';
    }
  }
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

function isValidMapping(m: ReportMapping): boolean {
  if (!m.mappingType) { console.warn(`[Excel] mapping ${m.id} missing mappingType — skip`); return false; }
  if (!m.fieldName)    { console.warn(`[Excel] mapping ${m.id} missing fieldName   — skip`); return false; }
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
  private _blocks: Record<string, BlockState> = {};

  // ── Template path resolver ────────────────────────────────

  private resolveTemplate(file: string | null): string | null {
    if (!file) return null;
    const p = path.join(TEMPLATES_DIR, file);
    return fs.existsSync(p) ? p : null;
  }

  // ── Worksheet resolver ─────────────────────────────────

  private resolveSheet(wb: ExcelJS.Workbook, sheetName?: string | null): ExcelJS.Worksheet {
    if (sheetName?.trim()) {
      const ws = wb.getWorksheet(sheetName.trim());
      if (ws) return ws;
    }
    if (wb.worksheets.length === 0) return wb.addWorksheet('Report');
    return wb.worksheets[0];
  }

  // ── Fill param ─────────────────────────────────────────

  /**
   * param mapping: reads from the params object (not from any recordset).
   * Type is always 'text' — params are strings from the HTTP request.
   */
  private fillParam(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    params: Record<string, any>
  ): void {
    const { fieldName, cellAddress } = mapping;
    if (!cellAddress) return;
    const raw = getNormalizedParam(params, fieldName);
    if (raw == null) return;

    // params are always text/date strings from user input — no special type detection needed
    const rv = convertForExcel(raw, 'text');
    const cell = ws.getCell(cellAddress);
    writeResolved(cell, rv, null);
  }

  // ── Fill scalar ────────────────────────────────────────

  /**
   * scalar mapping: reads from the first row of the resolved recordset.
   * Type is resolved from recordsetMetadata.
   */
  private fillScalar(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    data: Record<string, any>[],
    typeMap: Map<string, DetectedDataType>,
    recordsetIndex: number
  ): void {
    const { fieldName, cellAddress } = mapping;
    if (!cellAddress || data.length === 0) return;

    const key = `${recordsetIndex}|${fieldName.toUpperCase()}`;
    const type = typeMap.get(key) ?? 'text';
    const rv = convertForExcel(data[0]?.[fieldName.toUpperCase()], type);

    const cell = ws.getCell(cellAddress);
    writeResolved(cell, rv, null);
  }

  // ── Fill list block ────────────────────────────────────

  /**
   * list mapping: writes all rows of a field to a block of rows.
   *
   * Block semantics (guaranteed by shared state):
   *   - `block.rowStart` + `block.rowCount` define the row range for ALL columns.
   *   - `spliceRows()` is called exactly once — on the first column to hit a new block.
   *   - Subsequent columns reuse the already-allocated rows — perfectly aligned.
   *   - If `data.length` differs from `block.rowCount` → warn and cap to `block.rowCount`.
   */
  private fillList(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    data: Record<string, any>[],
    typeMap: Map<string, DetectedDataType>,
    recordsetIndex: number,
    sheetName: string
  ): void {
    const { fieldName, cellAddress } = mapping;
    if (!cellAddress || data.length === 0) return;

    const parsed = parseCell(cellAddress);
    if (!parsed) return;

    const { col, row: startRow } = parsed;
    const key = `${recordsetIndex}|${fieldName.toUpperCase()}`;
    const type = typeMap.get(key) ?? 'text';

    const bk = blockKey(sheetName, recordsetIndex, startRow);

    // ── Init block on first column hit
    if (!this._blocks[bk]) {
      this._blocks[bk] = {
        spliced: false,
        rowStart:   startRow,
        rowCount:   data.length,
        templateRow: startRow,
      };
    }
    const b = this._blocks[bk];

    // ── Mismatch guard: warn + cap
    if (data.length !== b.rowCount) {
      console.warn(
        `[Excel] Block "${bk}" col "${col}": ` +
        `data.length=${data.length} ≠ block.rowCount=${b.rowCount}. ` +
        `Capping at ${b.rowCount} to maintain alignment.`
      );
    }

    // ── Allocate rows once
    if (!b.spliced && b.rowCount > 1) {
      ws.spliceRows(b.rowStart + 1, 0, ...Array(b.rowCount - 1).fill(null));
      b.spliced = true;
    }

    // ── Template for style cloning
    const tmplCell = ws.getCell(`${col}${b.templateRow}`);
    const tmplRow  = ws.getRow(b.templateRow);
    const normalized = normalizeRows(data);

    // ── Write each row (capped to block rowCount)
    for (let i = 0; i < b.rowCount; i++) {
      const rowNum = b.rowStart + i;
      const raw = normalized[i]?.[fieldName.toUpperCase()] ?? '';
      const rv = convertForExcel(raw, type);
      const cell = ws.getCell(`${col}${rowNum}`);

      if (i === 0) {
        // Template row: preserve existing style + apply numFmt
        writeResolved(cell, rv, tmplCell);
      } else {
        // Newly inserted row: apply value + clone template style + numFmt
        applyCellStyle(cell, tmplCell, rv.numFmt);
        cell.value = rv.value;
        copyRowHeight(tmplRow, ws.getRow(rowNum));
      }
    }
  }

  // ── No-template fallback (creates a basic sheet) ────────

  private fillSheetFallback(ws: ExcelJS.Worksheet, rows: Record<string, any>[]): void {
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
        ws.getCell(ri + 2, ci + 1).value = row[c] ?? '';
      });
    });
  }

  // ── Public export ──────────────────────────────────────

  async exportReport(
    mappings: ReportMapping[],
    templateFile: string | null,
    params: Record<string, any>,
    recordsets: Record<string, any>[][],
    _fileName: string,
    recordsetMetadata?: RecordsetMetadata[]
  ): Promise<Buffer> {
    // Reset per-export state
    this._blocks = {};

    // ── Build field type map
    const typeMap = buildFieldTypeMap(recordsetMetadata ?? []);

    const wb = new ExcelJS.Workbook();

    // ── 1. Load template
    const tmplPath = this.resolveTemplate(templateFile);
    if (tmplPath) {
      // Use base64 so ExcelJS decodes internally (avoids Buffer type issues).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b64 = fs.readFileSync(tmplPath, 'base64');
      await (wb.xlsx.load as (d: any, o?: any) => Promise<unknown>)(b64, { base64: true });
    } else {
      for (let i = 0; i < recordsets.length; i++) {
        const rs = recordsets[i];
        if (!rs?.length) continue;
        const name = i === 0 ? 'Báo cáo' : `Sheet${i + 1}`;
        this.fillSheetFallback(wb.addWorksheet(name), rs);
      }
      if (!wb.worksheets.length) wb.addWorksheet('Report');
    }

    // ── 2. Group mappings
    const paramMappings = mappings.filter(m => m.mappingType === 'param');
    const scalarMappings = mappings.filter(m => m.mappingType === 'scalar');
    const listMappings   = mappings.filter(m => m.mappingType === 'list');

    // ── 3. Fill param (params only — no recordset)
    for (const m of paramMappings) {
      if (!isValidMapping(m)) continue;
      const ws = this.resolveSheet(wb, m.sheetName);
      this.fillParam(ws, m, params);
    }

    // ── 4. Fill scalar (recordset[recordsetIndex], first row only)
    for (const m of scalarMappings) {
      if (!isValidMapping(m)) continue;
      const ws = this.resolveSheet(wb, m.sheetName);
      const rsIdx = m.recordsetIndex ?? 0;
      const data = resolveRecordset(recordsets, rsIdx);
      this.fillScalar(ws, m, data, typeMap, rsIdx);
    }

    // ── 5. Fill list (block-level: sorted by startRow asc so template row first)
    const sorted = [...listMappings].sort((a, b) => {
      const ar = parseInt((a.cellAddress?.match(/\d+/)?.[0]) || '0');
      const br = parseInt((b.cellAddress?.match(/\d+/)?.[0]) || '0');
      return ar - br;
    });

    for (const m of sorted) {
      if (!isValidMapping(m)) continue;
      const ws = this.resolveSheet(wb, m.sheetName);
      const sheetName = ws.name;
      const rsIdx = m.recordsetIndex ?? 0;
      const data = resolveRecordset(recordsets, rsIdx);
      this.fillList(ws, m, data, typeMap, rsIdx, sheetName);
    }

    // ── 6. Serialize
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}

export const excelService = new ExcelService();
