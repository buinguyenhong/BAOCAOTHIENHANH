import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReportMapping } from '../models/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

/**
 * Export report to Excel with template support.
 *
 * Template logic:
 * - scalar mapping: fill a single cell with a scalar value
 * - list mapping:   fill rows starting from the cellAddress row,
 *                   copy formatting from that row (template row),
 *                   insert new rows if data is larger than template
 * - sheetName:      target specific worksheet (null = first sheet)
 * - recordsets:      each recordset is mapped to a sheet by index (0=first sheet, 1=second sheet...)
 *                   Mappings with matching sheetName fill that sheet;
 *                   scalar mappings fill all sheets;
 *                   list mappings without sheetName fill the first recordset
 */
export class ExcelService {
  /**
   * Per-export row tracker: sheetName → { columnLetter → currentFillRow }
   * Ensures all list columns in the same sheet grow from the same starting row.
   */
  private _sheetRowTracker: Record<string, Record<string, number>> = {};

  /**
   * Resolve template file path from the stored relative path.
   * templateFile format: "{reportId}/{filename.xlsx}"
   */
  private resolveTemplatePath(templateFile: string | null): string | null {
    if (!templateFile) return null;
    const filePath = path.join(TEMPLATES_DIR, templateFile);
    return fs.existsSync(filePath) ? filePath : null;
  }

  /**
   * Normalize row keys to uppercase for case-insensitive matching.
   */
  private normalizeRows(rows: Record<string, any>[]): Record<string, any>[] {
    return rows.map(row => {
      const normalized: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        normalized[k.toUpperCase()] = v;
      }
      return normalized;
    });
  }

  /**
   * Get worksheet by name, fallback to first sheet.
   */
  private getSheet(workbook: ExcelJS.Workbook, name?: string): ExcelJS.Worksheet {
    if (name && name.trim()) {
      const ws = workbook.getWorksheet(name.trim());
      if (ws) return ws;
    }
    return workbook.worksheets[0];
  }

  /**
   * Copy full cell style from source to target.
   * Includes all formatting: font, border, fill, alignment, number format,
   * protection, and rich text.
   */
  private copyCellStyle(source: ExcelJS.Cell, target: ExcelJS.Cell): void {
    // Deep clone font
    if (source.font) {
      target.font = {
        name: source.font.name,
        family: source.font.family,
        size: source.font.size,
        bold: source.font.bold,
        italic: source.font.italic,
        underline: source.font.underline,
        color: source.font.color ? { argb: source.font.color.argb } : undefined,
        strike: source.font.strike,
        vertAlign: source.font.vertAlign,
      };
    }
    // Deep clone border
    if (source.border) {
      target.border = JSON.parse(JSON.stringify(source.border));
    }
    // Deep clone fill
    if (source.fill) {
      target.fill = JSON.parse(JSON.stringify(source.fill));
    }
    // Deep clone alignment
    if (source.alignment) {
      target.alignment = JSON.parse(JSON.stringify(source.alignment));
    }
    // Number format
    target.numFmt = source.numFmt || 'General';
    // Protection
    if (source.protection) {
      target.protection = JSON.parse(JSON.stringify(source.protection));
    }
  }

  /**
   * Copy row height from source row to target row.
   */
  private copyRowHeight(source: ExcelJS.Row, target: ExcelJS.Row): void {
    if (source.height) target.height = source.height;
  }

  /**
   * Get a serializable snapshot of a cell's full style.
   * Used to preserve template cell formatting when overwriting values.
   */
  private snapshotCellStyle(cell: ExcelJS.Cell): Record<string, any> {
    return {
      font: cell.font ? JSON.parse(JSON.stringify(cell.font)) : undefined,
      border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : undefined,
      fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : undefined,
      alignment: cell.alignment ? JSON.parse(JSON.stringify(cell.alignment)) : undefined,
      numFmt: cell.numFmt,
      protection: cell.protection ? JSON.parse(JSON.stringify(cell.protection)) : undefined,
    };
  }

  /**
   * Restore a cell style from a snapshot previously captured by snapshotCellStyle.
   */
  private restoreCellStyle(cell: ExcelJS.Cell, style: Record<string, any>): void {
    if (style.font) cell.font = style.font as any;
    if (style.border) cell.border = style.border as any;
    if (style.fill) cell.fill = style.fill as any;
    if (style.alignment) cell.alignment = style.alignment as any;
    if (style.numFmt) cell.numFmt = style.numFmt;
    if (style.protection) cell.protection = style.protection as any;
  }

  /**
   * Fill scalar mapping: write a single value into a specific cell.
   * Value comes from params (param values) or data[0] (scalar column data).
   */
  private fillScalar(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    data: Record<string, any>[],
    params: Record<string, any>
  ): void {
    const { fieldName, cellAddress } = mapping;
    if (!cellAddress) return;

    const normalized = this.normalizeRows(data);
    const fieldKey = fieldName.toUpperCase();

    // Strip @ prefix for param mappings so @TuNgay matches params['TuNgay']
    const paramKey = fieldName.startsWith('@') ? fieldName.slice(1) : fieldName;
    const paramKeyUpper = paramKey.toUpperCase();

    // Value priority: params[fieldName] or params[paramKey] > data[0][fieldKey]
    const rawValue =
      params[fieldName] !== undefined
        ? params[fieldName]
        : params[paramKey] !== undefined
          ? params[paramKey]
          : params[paramKeyUpper] !== undefined
            ? params[paramKeyUpper]
            : normalized[0]?.[fieldKey];

    if (rawValue == null) return;

    // Smart type detection
    const strVal = String(rawValue).trim();
    let cellValue: string | number = strVal;
    if (
      !isNaN(Number(rawValue)) &&
      strVal !== '' &&
      strVal.length < 15 &&
      !strVal.startsWith('0') &&
      !/^\d{6,}$/.test(strVal)
    ) {
      cellValue = Number(rawValue);
    }

    // Preserve template cell formatting (style snapshot + restore)
    const targetCell = ws.getCell(cellAddress);
    const savedStyle = this.snapshotCellStyle(targetCell);
    targetCell.value = cellValue;
    this.restoreCellStyle(targetCell, savedStyle);
  }

  /**
   * Fill list mapping: write data rows into worksheet.
   * - Starts at the row specified in cellAddress (template row)
   * - Copies formatting from the template row to all inserted rows
   * - Inserts new rows if data.length > 1
   * @param rowTracker  - Tracks the current fill row per column, so list columns
   *                      don't overwrite each other; shared across columns in same sheet.
   */
  private fillList(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    data: Record<string, any>[],
    rowTracker: Record<string, number>
  ): void {
    const { fieldName, cellAddress } = mapping;
    if (!cellAddress || data.length === 0) return;

    const normalized = this.normalizeRows(data);
    const fieldKey = fieldName.toUpperCase();

    // Parse column letter and row number from cellAddress, e.g. "A4" → colLetter="A", templateRowNum=4
    const colMatch = cellAddress.match(/[a-zA-Z]+/);
    const rowMatch = cellAddress.match(/[0-9]+/);
    if (!colMatch) return;
    const colLetter = colMatch[0];

    // Use tracked row so all list columns start at the same row and grow together
    const templateRowNum = rowTracker[colLetter] ?? (rowMatch ? parseInt(rowMatch[0]) : 4);
    const templateRow = ws.getRow(templateRowNum);
    const templateCell = ws.getCell(`${colLetter}${templateRowNum}`);

    // Insert new rows BEFORE any cell writes (shared across all columns)
    const rowsNeeded = data.length;
    if (rowsNeeded > 1) {
      ws.spliceRows(templateRowNum + 1, 0, ...Array(rowsNeeded - 1).fill(null));
    }

    // Fill each data row
    for (let idx = 0; idx < data.length; idx++) {
      const currentRowNum = templateRowNum + idx;
      const rowData = normalized[idx];
      const targetCell = ws.getCell(`${colLetter}${currentRowNum}`);
      const val = rowData?.[fieldKey] ?? '';

      // Smart type detection
      const strVal = String(val).trim();
      let cellValue: string | number = val;
      if (
        !isNaN(Number(val)) &&
        strVal !== '' &&
        strVal.length < 15 &&
        !strVal.startsWith('0') &&
        !/^\d{6,}$/.test(strVal)
      ) {
        cellValue = Number(val);
      }

      if (idx === 0) {
        // First row: snapshot existing template style, set value, restore style
        const savedStyle = this.snapshotCellStyle(targetCell);
        targetCell.value = cellValue;
        this.restoreCellStyle(targetCell, savedStyle);
      } else {
        // New rows: set value then copy style from template cell
        targetCell.value = cellValue;
        this.copyCellStyle(templateCell, targetCell);
        const currentRow = ws.getRow(currentRowNum);
        this.copyRowHeight(templateRow, currentRow);
      }
    }

    // Advance tracker for this column (tracks how many rows were filled)
    rowTracker[colLetter] = templateRowNum + data.length;
  }

  /**
   * Export report to Excel buffer.
   *
   * @param mappings        - ReportMapping[] defining how to fill cells
   * @param templateFile    - Relative path stored in DB, e.g. "{reportId}/template.xlsx"
   * @param params          - Scalar values from report parameters (for scalar mappings)
   * @param recordsets      - Array of result sets; each index maps to a sheet
   * @param outputFileName  - Name of the output file (for reference only)
   */
  async exportReport(
    mappings: ReportMapping[],
    templateFile: string | null,
    params: Record<string, any>,
    recordsets: Record<string, any>[][],
    _outputFileName: string
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Reset row tracker for this export
    this._sheetRowTracker = {};

    // 1. Load template if exists
    const templatePath = this.resolveTemplatePath(templateFile);
    if (templatePath) {
      const buffer = fs.readFileSync(templatePath);
      await workbook.xlsx.load(buffer.buffer as ArrayBuffer);
    } else {
      // No template: create one sheet per recordset
      for (let i = 0; i < recordsets.length; i++) {
        const rs = recordsets[i];
        if (rs.length === 0) continue;
        const sheetName = i === 0 ? 'Báo cáo' : `Sheet${i + 1}`;
        const ws = workbook.addWorksheet(sheetName);
        this.fillSheetFromRecordset(ws, rs);
      }
    }

    // 2. Get the list of sheet names from the workbook for assignment
    const workbookSheets = workbook.worksheets.map(ws => ws.name);

    // 3. Build lookup: sheetName → sheet index (for sheet-aware mappings)
    const sheetNameToIdx = new Map<string, number>();
    workbookSheets.forEach((name, idx) => sheetNameToIdx.set(name, idx));

    // 4. Determine active recordset per workbook sheet
    // Each workbook sheet i uses recordsets[i] (or first recordset if out of bounds)
    const sheetRecordsetMap: Record<number, Record<string, any>[]> = {};
    for (let i = 0; i < workbookSheets.length; i++) {
      sheetRecordsetMap[i] = recordsets[i] || recordsets[0] || [];
    }

    // 5. Group mappings
    const scalarMappings = mappings.filter(m => m.mappingType === 'scalar');
    const listMappings = mappings.filter(m => m.mappingType === 'list');
    const paramMappings = mappings.filter(m => m.mappingType === 'param');

    // 6. Fill scalar mappings — only on the sheet specified (or first sheet if none)
    for (const mapping of scalarMappings) {
      let targetSheetName: string;
      let dataRecordset: Record<string, any>[];

      if (mapping.sheetName && mapping.sheetName.trim()) {
        targetSheetName = mapping.sheetName.trim();
        const sheetIdx = sheetNameToIdx.get(targetSheetName) ?? 0;
        dataRecordset = recordsets[sheetIdx] || recordsets[0] || [];
      } else {
        targetSheetName = workbookSheets[0];
        dataRecordset = recordsets[0] || [];
      }

      const ws = workbook.getWorksheet(targetSheetName);
      if (ws) {
        this.fillScalar(ws, mapping, dataRecordset, params);
      }
    }

    // 7. Fill param mappings — same logic as scalar (single value, no row insertion)
    for (const mapping of paramMappings) {
      let targetSheetName: string;
      let dataRecordset: Record<string, any>[];

      if (mapping.sheetName && mapping.sheetName.trim()) {
        targetSheetName = mapping.sheetName.trim();
        const sheetIdx = sheetNameToIdx.get(targetSheetName) ?? 0;
        dataRecordset = recordsets[sheetIdx] || recordsets[0] || [];
      } else {
        targetSheetName = workbookSheets[0];
        dataRecordset = recordsets[0] || [];
      }

      const ws = workbook.getWorksheet(targetSheetName);
      if (ws) {
        this.fillScalar(ws, mapping, dataRecordset, params);
      }
    }

    // 8. Fill list mappings — one rowTracker per sheet
    // Sort by starting row so template row always processed first
    const sortedList = [...listMappings].sort((a, b) => {
      const aRow = parseInt((a.cellAddress?.match(/[0-9]+/)?.[0]) || '0');
      const bRow = parseInt((b.cellAddress?.match(/[0-9]+/)?.[0]) || '0');
      return aRow - bRow;
    });

    for (const mapping of sortedList) {
      let targetSheetName: string;
      let dataRecordset: Record<string, any>[];

      if (mapping.sheetName && mapping.sheetName.trim()) {
        targetSheetName = mapping.sheetName.trim();
        const sheetIdx = sheetNameToIdx.get(targetSheetName) ?? 0;
        dataRecordset = recordsets[sheetIdx] || recordsets[0] || [];
      } else {
        targetSheetName = workbookSheets[0];
        dataRecordset = recordsets[0] || [];
      }

      const ws = workbook.getWorksheet(targetSheetName);
      if (!ws) continue;

      // Use per-sheet row tracker so all columns in same sheet grow together
      if (!this._sheetRowTracker[targetSheetName]) {
        this._sheetRowTracker[targetSheetName] = {};
      }

      this.fillList(ws, mapping, dataRecordset, this._sheetRowTracker[targetSheetName]);
    }

    // 8. Return as buffer
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf) as unknown as Buffer;
  }

  /**
   * Fill a worksheet from a recordset (used for no-template export).
   * Writes all columns as headers in row 1, data in rows 2+.
   */
  private fillSheetFromRecordset(ws: ExcelJS.Worksheet, rows: Record<string, any>[]): void {
    if (rows.length === 0) return;
    const columns = Object.keys(rows[0]);

    // Write header row
    columns.forEach((col, colIdx) => {
      const cell = ws.getCell(1, colIdx + 1);
      cell.value = col;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    });

    // Write data rows
    rows.forEach((row, rowIdx) => {
      columns.forEach((col, colIdx) => {
        ws.getCell(rowIdx + 2, colIdx + 1).value = row[col] ?? '';
      });
    });
  }
}

export const excelService = new ExcelService();
