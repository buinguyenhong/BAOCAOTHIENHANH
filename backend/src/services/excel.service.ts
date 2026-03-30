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
   */
  private copyCellStyle(source: ExcelJS.Cell, target: ExcelJS.Cell): void {
    target.font = { ...source.font };
    target.border = JSON.parse(JSON.stringify(source.border || {}));
    target.fill = JSON.parse(JSON.stringify(source.fill || {}));
    target.alignment = JSON.parse(JSON.stringify(source.alignment || {}));
    target.numFmt = source.numFmt || 'General';
  }

  /**
   * Copy row height from source row to target row.
   */
  private copyRowHeight(source: ExcelJS.Row, target: ExcelJS.Row): void {
    if (source.height) target.height = source.height;
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

    // Value priority: params[fieldName] > data[0][fieldKey]
    const rawValue =
      params[fieldName] !== undefined
        ? params[fieldName]
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

    ws.getCell(cellAddress).value = cellValue;
  }

  /**
   * Fill list mapping: write data rows into worksheet.
   * - Starts at the row specified in cellAddress (template row)
   * - Copies formatting from the template row to all inserted rows
   * - Inserts new rows if data.length > 1
   */
  private fillList(
    ws: ExcelJS.Worksheet,
    mapping: ReportMapping,
    data: Record<string, any>[]
  ): void {
    const { fieldName, cellAddress } = mapping;
    if (!cellAddress || data.length === 0) return;

    const normalized = this.normalizeRows(data);
    const fieldKey = fieldName.toUpperCase();

    // Parse row number from cellAddress, e.g. "A10" → 10
    const rowMatch = cellAddress.match(/[0-9]+/);
    const templateRowNum = rowMatch ? parseInt(rowMatch[0]) : 10;

    // Get template row cells for style copying
    const templateRow = ws.getRow(templateRowNum);
    const colMatch = cellAddress.match(/[a-zA-Z]+/);
    if (!colMatch) return;
    const colLetter = colMatch[0];
    const templateCell = ws.getCell(cellAddress); // e.g. A10

    // Insert new rows before filling (needed if data is bigger than template)
    // ExcelJS insertRows with 2 args expects array, so use spliceRows instead
    if (data.length > 1) {
      ws.spliceRows(templateRowNum + 1, 0, ...Array(data.length - 1).fill(null));
    }

    // Fill each data row
    for (let idx = 0; idx < data.length; idx++) {
      const currentRowNum = templateRowNum + idx;
      const rowData = normalized[idx];
      const targetCell = ws.getCell(`${colLetter}${currentRowNum}`);
      const val = rowData?.[fieldKey] ?? '';

      // Smart type detection
      const strVal = String(val).trim();
      if (
        !isNaN(Number(val)) &&
        strVal !== '' &&
        strVal.length < 15 &&
        !strVal.startsWith('0') &&
        !/^\d{6,}$/.test(strVal)
      ) {
        targetCell.value = Number(val);
      } else {
        targetCell.value = val;
      }

      // Copy style from template cell (except first row — it's already the template)
      if (idx > 0) {
        this.copyCellStyle(templateCell, targetCell);
        const currentRow = ws.getRow(currentRowNum);
        this.copyRowHeight(templateRow, currentRow);
      }
    }
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

    // 6. Fill scalar mappings on ALL sheets
    for (const mapping of scalarMappings) {
      for (let i = 0; i < workbookSheets.length; i++) {
        const ws = workbook.getWorksheet(workbookSheets[i]);
        if (!ws) continue;
        const sheetData = sheetRecordsetMap[i] ?? sheetRecordsetMap[0] ?? [];
        this.fillScalar(ws, mapping, sheetData, params);
      }
    }

    // 7. Fill list mappings
    const sortedList = [...listMappings].sort((a, b) => {
      const aRow = parseInt((a.cellAddress?.match(/[0-9]+/)?.[0]) || '0');
      const bRow = parseInt((b.cellAddress?.match(/[0-9]+/)?.[0]) || '0');
      return aRow - bRow;
    });

    for (const mapping of sortedList) {
      if (mapping.sheetName && mapping.sheetName.trim()) {
        // Sheet-aware: fill the specific sheet
        const ws = workbook.getWorksheet(mapping.sheetName.trim());
        if (ws) {
          const sheetIdx = workbookSheets.indexOf(mapping.sheetName.trim());
          this.fillList(ws, mapping, sheetRecordsetMap[sheetIdx] ?? []);
        }
      } else {
        // No sheet specified: fill all sheets with the first recordset
        for (let i = 0; i < workbookSheets.length; i++) {
          const ws = workbook.getWorksheet(workbookSheets[i]);
          if (!ws) continue;
          this.fillList(ws, mapping, sheetRecordsetMap[i] ?? sheetRecordsetMap[0] ?? []);
        }
      }
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
