import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReportMapping } from '../models/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

export class ExcelService {
  async exportReport(
    data: Record<string, any>[],
    mappings: ReportMapping[],
    templateFileName: string | null,
    params: Record<string, any>,
    outputFileName: string
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Load template nếu có
    if (templateFileName) {
      const templatePath = path.join(TEMPLATES_DIR, templateFileName);
      if (fs.existsSync(templatePath)) {
        const buffer = fs.readFileSync(templatePath);
        await workbook.xlsx.load(buffer);
      } else {
        // Tạo worksheet mới nếu template không tồn tại
        workbook.addWorksheet('Báo cáo');
      }
    } else {
      workbook.addWorksheet('Báo cáo');
    }

    const worksheet = workbook.worksheets[0];

    // Normalize data: viết hoa key
    const normalizedData = data.map(row => {
      const newRow: Record<string, any> = {};
      Object.keys(row).forEach(k => {
        newRow[k.toUpperCase()] = row[k];
      });
      return newRow;
    });

    // 1. Điền scalar values (params và scalar mappings)
    for (const map of mappings) {
      if (map.mappingType === 'scalar') {
        const val = params[map.fieldName] !== undefined
          ? params[map.fieldName]
          : (normalizedData.length > 0 ? normalizedData[0][map.fieldName.toUpperCase()] : null);

        if (val !== null && val !== undefined && map.cellAddress) {
          worksheet.getCell(map.cellAddress).value = val;
        }
      }
    }

    // 2. Điền params vào ô được chỉ định
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        // Tìm mapping cho param này
        const paramMap = mappings.find(m => m.fieldName === key && m.mappingType === 'scalar' && m.cellAddress);
        if (paramMap?.cellAddress) {
          worksheet.getCell(paramMap.cellAddress).value = value;
        }
      }
    }

    // 3. Điền danh sách (list mappings)
    const listMappings = mappings.filter(m => m.mappingType === 'list');

    if (listMappings.length > 0 && normalizedData.length > 0) {
      // Tìm dòng bắt đầu (lấy row nhỏ nhất từ các list mapping)
      const startRows = listMappings
        .map(m => {
          const match = m.cellAddress?.match(/[0-9]+/);
          return match ? parseInt(match[0]) : null;
        })
        .filter((r): r is number => r !== null && r > 0);

      if (startRows.length === 0) {
        // Không có ô nào được set → ghi ra từ A10
        startRows.push(10);
      }

      const firstDataRow = Math.min(...startRows);

      // Chèn thêm dòng nếu cần
      if (normalizedData.length > 1) {
        worksheet.insertRows(firstDataRow + 1, normalizedData.length - 1, 'i');
      }

      // Điền dữ liệu và sao chép định dạng
      normalizedData.forEach((rowData, dataIndex) => {
        const currentRowIndex = firstDataRow + dataIndex;

        listMappings.forEach(map => {
          const colMatch = map.cellAddress?.match(/[a-zA-Z]+/);
          if (!colMatch) return;
          const col = colMatch[0];
          const fieldKey = map.fieldName.toUpperCase();

          if (rowData.hasOwnProperty(fieldKey)) {
            const targetCell = worksheet.getCell(`${col}${currentRowIndex}`);
            const templateCell = worksheet.getCell(`${col}${firstDataRow}`);
            const val = rowData[fieldKey];

            // Smart type detection
            if (val !== null && val !== undefined) {
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
                targetCell.value = val === null ? '' : val;
              }
            } else {
              targetCell.value = '';
            }

            // Copy formatting từ template row
            if (dataIndex > 0) {
              targetCell.style = {
                ...templateCell.style,
                numFmt: templateCell.numFmt,
              };
            }
          }
        });

        // Copy row height
        if (dataIndex > 0) {
          const templateHeight = worksheet.getRow(firstDataRow).height;
          if (templateHeight) {
            worksheet.getRow(currentRowIndex).height = templateHeight;
          }
        }
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer) as unknown as Buffer;
  }
}

export const excelService = new ExcelService();
