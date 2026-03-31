/**
 * Excel Service - Export Engine
 *
 * Key concepts:
 * - Block: uniquely identified by (sheetName + recordsetIndex + startRow).
 *   One block is splicedRows() exactly once. All list columns in the same block
 *   share the same starting row and grow together.
 * - recordsetIndex: explicit data source selector (default 0 = first recordset).
 * - sheetName: only determines which worksheet to write to.
 * - fillParam: only reads from params (never from recordset data).
 * - fillScalar: only reads from data[0] (first row of recordset).
 * - normalize rows to uppercase for case-insensitive field lookup.
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReportMapping } from '../models/types.js';
import {
  normalizeRow,
  normalizeRows,
  buildParamLookup,
  getNormalizedParam,
} from '../utils/normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

// ─────────────────────────────────────────────
// Block Tracker
// ─────────────────────────────────────────────

interface BlockState {
  /** Rows have been spliced for this block already */
  spliced: boolean;
  /** Next free row for each column letter */
  colRow: Record<string, number>;
}

function makeBlockKey(
  sheetName: string,
  recordsetIndex: number,
  startRow: number
): string {
  return `${sheetName}|${recordsetIndex}|${startRow}`;
}

// ─────────────────────────────────────────────
// Cell helpers
// ─────────────────────────────────────────────

/** Parse "A4" → { col: "A", row: 4 } */
function parseCellAddress(addr: string): { col: string; row: number } | null {
  const m = addr.match(/^([a-zA-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: parseInt(m[2], 10) };
}

/** Parse column letter(s) to index (1-based): A→1, B→2, AA→27 */
function colLetterToIndex(col: string): number {
  let idx = 0;
  for (const ch of col.toUpperCase()) {
    idx = idx * 26 + (ch.charCodeAt(0) - 64);
  }
  return idx;
}

/** Detect if a value should be stored as number instead of string. */
function smartType(val: any): string | number {
  const s = String(val).trim();
  if (
    s !== '' &&
    !isNaN(Number(val)) &&
    s.length < 15 &&
    !s.startsWith('0') &&
    !/^\d{6,}$/.test(s)
  ) {
    return Number(val);
  }
  return s;
}

/** Snapshot full style of a cell. */
function snapshotStyle(cell: ExcelJS.Cell): Record<string, any> {
  const snap = (obj: any) => (obj ? JSON.parse(JSON.stringify(obj)) : undefined);
  return {
    font: snap(cell.font),
    border: snap(cell.border),
    fill: snap(cell.fill),
    alignment: snap(cell.alignment),
    numFmt: cell.numFmt,
    protection: snap(cell.protection),
  };
}

/** Restore style snapshot onto a cell. */
function restoreStyle(cell: ExcelJS.Cell, style: Record<string, any>): void {
  if (style.font) cell.font = style.font as any;
  if (style.border) cell.border = style.border as any;
  if (style.fill) cell.fill = style.fill as any;
  if (style.alignment) cell.alignment = style.alignment as any;
  if (style.numFmt) cell.numFmt = style.numFmt;
  if (style.protection) cell.protection = style.protection as any;
}

// ─────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────

function isValidMapping(m: ReportMapping): boolean {
  if (!m.mappingType) {
    console.warn(`[ExcelService] mapping ${m.id} missing mappingType — skipping`);
    return false;
  }
  if (!m.fieldName) {
    console.warn(`[ExcelService] mapping ${m.id} missing fieldName — skipping`);
    return false;
  }
  if (m.mappingType !== 'param' && !m.cellAddress) {
    console.warn(`[ExcelService] mapping ${m.id} (${m.mappingType}) missing cellAddress — skipping`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// Recordset resolver
// ─────────────────────────────────────────────

function resolveRecordset(
  recordsets: Record<string, any>[][],
  recordsetIndex: number | null | undefined
): Record<string, any>[] {
  const idx = recordsetIndex ?? 0;
  if (idx >= 0 && idx < recordsets.length) {
    return recordsets[idx];
  }
  return recordsets[0] ?? [];
}

// ─────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────

export class ExcelService {
  /**
   * Per-export block tracker.
   * Key = "sheetName|recordsetIndex|startRow", Value = BlockState.
   */
  private _blocks: Record<string, BlockState> = {};

  // ── Template resolution ──────────────────────────────────

  private resolveTemplatePath(templateFile: string | null): string | null {
    if (!templateFile) return null;
    const filePath = path.join(TEMPLATES_DIR, templateFile);
    return fs.existsSync(filePath) ? filePath : null;
  }

  // ── Worksheet helpers ─────────────────────────────────────

  private getSheet(workbook: ExcelJS.Workbook, sheetName?: string | null): ExcelJS.Worksheet {
    if (sheetName && sheetName.trim()) {
      const ws = workbook.getWorksheet(sheetName.trim());
      if (ws) return ws;
    }
    if (workbook.worksheets.length === 0) {
      return workbook.addWorksheet('Report');
    }
    return workbook.worksheets[0];
  }

  // ── Style copy ───────────────────────────────────────────

  private copyRowStyle(source: ExcelJS.Row, target: ExcelJS.Row): void {
    if (source.height) target.height = source.height;
  }

  private copyCellStyle(source: ExcelJS.Cell, target: ExcelJS.Cell): void {
    const snap = (obj: any) => (obj ? JSON.parse(JSON.stringify(obj)) : undefined);
    if (source.font) target.font = snap(source.font);
    if (source.border) target.border = snap(source.border);
    if (source.fill) target.fill = snap(source.fill);
    if (source.alignment) target.alignment = snap(source.alignment);
    target.numFmt = source.numFmt || 'General';
    if (source.protection) target.protection = snap(source.protection);
  }

  // ── fillParam: single value from params only ────────────

  private fillParam(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    params: Record<string, any>
  ): void {
    const { fieldName, cellAddress } = mapping;
    if (!cellAddress) return;

    const value = getNormalizedParam(params, fieldName);
    if (value == null) return;

    const targetCell = ws.getCell(cellAddress);
    const saved = snapshotStyle(targetCell);
    targetCell.value = smartType(value);
    restoreStyle(targetCell, saved);
  }

  // ── fillScalar: single value from data[0] only ───────────

  private fillScalar(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    data: Record<string, any>[]
  ): void {
    const { fieldName, cellAddress } = mapping;
    if (!cellAddress || data.length === 0) return;

    const normalized = normalizeRows(data);
    const value = normalized[0]?.[fieldName.toUpperCase()];
    if (value == null) return;

    const targetCell = ws.getCell(cellAddress);
    const saved = snapshotStyle(targetCell);
    targetCell.value = smartType(value);
    restoreStyle(targetCell, saved);
  }

  // ── fillList: data rows with block-level splice ─────────

  private fillList(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    data: Record<string, any>[],
    blockStates: Record<string, BlockState>,
    sheetName: string
  ): void {
    const { fieldName, cellAddress, recordsetIndex } = mapping;
    if (!cellAddress || data.length === 0) return;

    const parsed = parseCellAddress(cellAddress);
    if (!parsed) return;

    const { col, row: startRow } = parsed;
    const rsIdx = recordsetIndex ?? 0;

    // ── Block key
    const blockKey = makeBlockKey(sheetName, rsIdx, startRow);

    // ── Init block state if new
    if (!blockStates[blockKey]) {
      blockStates[blockKey] = { spliced: false, colRow: {} };
    }
    const block = blockStates[blockKey];

    // ── Track row for this column
    if (block.colRow[col] === undefined) {
      block.colRow[col] = startRow;
    }

    // ── Splice rows only on first column that hits this block
    const thisColRow = block.colRow[col];
    const rowsNeeded = data.length;

    if (!block.spliced && rowsNeeded > 1) {
      // Insert (rowsNeeded - 1) blank rows after startRow
      ws.spliceRows(thisColRow + 1, 0, ...Array(rowsNeeded - 1).fill(null));
      block.spliced = true;
    }

    // ── Template cell for style cloning
    const templateCell = ws.getCell(`${col}${thisColRow}`);
    const templateRow = ws.getRow(thisColRow);

    // ── Normalize rows for case-insensitive field lookup
    const normalized = normalizeRows(data);
    const fieldKey = fieldName.toUpperCase();

    // ── Write each row
    for (let i = 0; i < data.length; i++) {
      const currentRowNum = thisColRow + i;
      const val = normalized[i]?.[fieldKey] ?? '';
      const targetCell = ws.getCell(`${col}${currentRowNum}`);

      if (i === 0) {
        // First row: preserve template style
        const saved = snapshotStyle(targetCell);
        targetCell.value = smartType(val);
        restoreStyle(targetCell, saved);
      } else {
        // New rows: write value then clone style from template
        targetCell.value = smartType(val);
        this.copyCellStyle(templateCell, targetCell);
        this.copyRowStyle(templateRow, ws.getRow(currentRowNum));
      }
    }

    // ── Advance tracker for this column
    block.colRow[col] = thisColRow + data.length;
  }

  // ── Fill a worksheet from a recordset (no-template fallback) ──

  private fillSheetFromRecordset(
    ws: ExcelJS.Worksheet,
    rows: Record<string, any>[]
  ): void {
    if (rows.length === 0) return;
    const columns = Object.keys(rows[0]);

    // Header row
    columns.forEach((col, ci) => {
      const cell = ws.getCell(1, ci + 1);
      cell.value = col;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    });

    // Data rows
    rows.forEach((row, ri) => {
      columns.forEach((col, ci) => {
        ws.getCell(ri + 2, ci + 1).value = row[col] ?? '';
      });
    });
  }

  // ── Public export ────────────────────────────────────────

  async exportReport(
    mappings: ReportMapping[],
    templateFile: string | null,
    params: Record<string, any>,
    recordsets: Record<string, any>[][],
    _outputFileName: string
  ): Promise<Buffer> {
    // Reset per-export state
    this._blocks = {};

    const workbook = new ExcelJS.Workbook();

    // ── 1. Load template
    const templatePath = this.resolveTemplatePath(templateFile);
    if (templatePath) {
      const buffer = fs.readFileSync(templatePath);
      // Load directly from buffer (pass ArrayBuffer so ExcelJS accepts it)
      await workbook.xlsx.load(buffer.buffer as ArrayBuffer);
    } else {
      // No template: create one sheet per non-empty recordset
      for (let i = 0; i < recordsets.length; i++) {
        const rs = recordsets[i];
        if (!rs || rs.length === 0) continue;
        const name = i === 0 ? 'Báo cáo' : `Sheet${i + 1}`;
        const ws = workbook.addWorksheet(name);
        this.fillSheetFromRecordset(ws, rs);
      }
      // Ensure at least one sheet
      if (workbook.worksheets.length === 0) {
        workbook.addWorksheet('Report');
      }
    }

    // ── 2. Build sheet-name → index map
    const sheetNameToIdx = new Map<string, number>();
    workbook.worksheets.forEach((ws, i) => sheetNameToIdx.set(ws.name, i));

    // ── 3. Group mappings by type
    const paramMappings = mappings.filter(m => m.mappingType === 'param');
    const scalarMappings = mappings.filter(m => m.mappingType === 'scalar');
    const listMappings = mappings.filter(m => m.mappingType === 'list');

    // ── 4. Fill param mappings (params only, no recordset data)
    for (const mapping of paramMappings) {
      if (!isValidMapping(mapping)) continue;
      const ws = this.getSheet(workbook, mapping.sheetName);
      this.fillParam(ws, mapping, params);
    }

    // ── 5. Fill scalar mappings (recordset[0] only)
    for (const mapping of scalarMappings) {
      if (!isValidMapping(mapping)) continue;
      const ws = this.getSheet(workbook, mapping.sheetName);
      const rsIdx = mapping.recordsetIndex ?? 0;
      const data = resolveRecordset(recordsets, rsIdx);
      this.fillScalar(ws, mapping, data);
    }

    // ── 6. Fill list mappings (with block-level splice coordination)
    // Sort by starting row ascending — ensures template row is processed first
    const sortedList = [...listMappings].sort((a, b) => {
      const aRow = parseInt((a.cellAddress?.match(/\d+/)?.[0]) || '0');
      const bRow = parseInt((b.cellAddress?.match(/\d+/)?.[0]) || '0');
      return aRow - bRow;
    });

    for (const mapping of sortedList) {
      if (!isValidMapping(mapping)) continue;

      const ws = this.getSheet(workbook, mapping.sheetName);
      const targetSheetName = ws.name;
      const rsIdx = mapping.recordsetIndex ?? 0;
      const data = resolveRecordset(recordsets, rsIdx);

      // Per-sheet block state (keyed by blockKey)
      const blockKey = makeBlockKey(
        targetSheetName,
        rsIdx,
        parseInt((mapping.cellAddress?.match(/\d+/)?.[0]) || '0')
      );
      if (!this._blocks[blockKey]) {
        this._blocks[blockKey] = { spliced: false, colRow: {} };
      }

      this.fillList(ws, mapping, data, this._blocks, targetSheetName);
    }

    // ── 7. Serialize to buffer
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}

export const excelService = new ExcelService();
