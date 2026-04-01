# Project Summary — BAOCAOTHIENHANH

> Cập nhật: 2026-04-01 — Refactor deterministic, config-driven export

---

## 1. Kiến trúc cũ có vấn đề gì

### 1.1. Heuristic detect cho export — nguồn gốc bug số thành date

Hệ thống cũ dùng kết quả runtime (sample data từ lần chạy thử) để suy luận kiểu dữ liệu cho export:

- **Số bị thành date:** `BenhAn_Id = 5` → nếu data ngẫu nhiên nằm trong date serial range → bị hiểu là date
- **Datetime không nhất quán:** cùng một trường, lần có data → detect được, lần sau null → fallback text/date sai
- **Format phụ thuộc dữ liệu:** sample ngày 05/01/1900 → serial = 5 → heuristic nhầm là số 5

### 1.2. Cấu hình tham số không đủ

`ReportParameters` cũ chỉ có: `paramName`, `paramLabel`, `paramType` (cơ bản), `defaultValue`, `isRequired`.

**Thiếu nghiêm trọng:**
- `valueMode` → không phân biệt single / csv / json → multiselect gửi sai format cho SP
- `optionsSourceType` / `options` / `optionsQuery` → select không có options, admin phải nhập tay
- SQL metadata → admin không biết kiểu SP, không biết nullable/default

### 1.3. Mapping không đủ metadata cho export

`ReportMapping` cũ chỉ có: `fieldName`, `cellAddress`, `mappingType`, `displayOrder`.

**Thiếu:**
- `sheetName` → không chỉ rõ sheet nào
- `recordsetIndex` → multi-recordset mập mờ
- `valueType` → KHÔNG có → export phải đoán
- `formatPattern` → không override được

### 1.4. Fill logic tự quyết định type khi đang fill

`fillParam`, `fillScalar`, `fillList` gọi type detection ngay trong lúc fill → không có contract rõ ràng, không deterministic.

---

## 2. Kiến trúc mới hoạt động thế nào

### 2.1. Ba tầng độc lập, contract rõ

```
Tầng 1 — Config
  Admin thiết lập ReportParameters + ReportMappings
  (rõ ràng, đầy đủ, không đoán)

Tầng 2 — Execute
  User nhập params → serializeReportParams() → execute SP → raw recordsets

Tầng 3 — Export (DETERMINISTIC)
  Với từng mapping:
    1. Lấy valueType TỪ CONFIG (KHÔNG đoán)
    2. Gọi convertForExport(raw, valueType, formatPattern)
    3. Ghi cell
```

### 2.2. Contract convertForExport

```
convertForExport(raw, 'number', null)
  → excelValue = Number(raw), formatKind = 'number', numFmt = null
  → KHÔNG BAO GIỜ thành date

convertForExport(raw, 'datetime', null)
  → excelValue = serial, formatKind = 'datetime', numFmt = 'dd/MM/yyyy HH:mm:ss'
  → Luôn datetime, không fallback

convertForExport(raw, 'text', null)
  → excelValue = String(raw), formatKind = 'text', numFmt = null

convertForExport(raw, 'date', null)
  → excelValue = serial, formatKind = 'date', numFmt = 'dd/MM/yyyy'
```

### 2.3. Param serialization pipeline

```
rawInput (string | string[] | Date)
  → normalizeInputValue()        // tách array, nhận diện csv string
  → serializeByParamType()      // date → YYYY-MM-DD, datetime → YYYY-MM-DD HH:mm:ss, number → string
  → serializeByValueMode()       // single → giá trị đầu / csv → join(,) / json → stringify
  → final string
```

---

## 3. Schema nào đã thêm/sửa

### ReportParameters — thêm 12 cột

```sql
ALTER TABLE ReportParameters ADD COLUMN sqlType TEXT;
ALTER TABLE ReportParameters ADD COLUMN maxLength INTEGER;
ALTER TABLE ReportParameters ADD COLUMN precision INTEGER;
ALTER TABLE ReportParameters ADD COLUMN scale INTEGER;
ALTER TABLE ReportParameters ADD COLUMN isNullable INTEGER;
ALTER TABLE ReportParameters ADD COLUMN hasDefaultValue INTEGER;
ALTER TABLE ReportParameters ADD COLUMN valueMode TEXT DEFAULT 'single';
ALTER TABLE ReportParameters ADD COLUMN optionsSourceType TEXT DEFAULT 'none';
ALTER TABLE ReportParameters ADD COLUMN optionsQuery TEXT;
ALTER TABLE ReportParameters ADD COLUMN placeholder TEXT;
ALTER TABLE ReportParameters ADD COLUMN options TEXT;  -- JSON array {value, label}
```

### ReportMappings — thêm 4 cột

```sql
ALTER TABLE ReportMappings ADD COLUMN sheetName TEXT;
ALTER TABLE ReportMappings ADD COLUMN recordsetIndex INTEGER DEFAULT 0;
ALTER TABLE ReportMappings ADD COLUMN valueType TEXT;
ALTER TABLE ReportMappings ADD COLUMN formatPattern TEXT;
```

---

## 4. API nào đã thêm/sửa

### Sửa đổi
| Route | Thay đổi |
|-------|---------|
| `GET /api/user/reports/:id/execute` | Thêm `serializeReportParams()` theo param config |
| `POST /api/user/reports/:id/export` | Backend re-execute SP → deterministic export |

### Thêm mới
| Route | Thay đổi |
|-------|---------|
| `PUT /api/reports/:id/parameters` | Save đầy đủ param config (valueMode, options, sql metadata…) |
| `PUT /api/reports/:id/mappings` | Save `valueType`, `formatPattern`, `recordsetIndex`, `sheetName` |
| `GET /api/reports/:id/template/sheets` | List sheets từ template file |
| `PUT /api/reports/:id/template` | Upload template |

---

## 5. File nào đã sửa

### Backend
| File | Thay đổi |
|------|---------|
| `src/models/types.ts` | `ReportParameter` đầy đủ (12 trường mới), `ReportMapping` có `valueType`, `formatPattern`, `sheetName`, `recordsetIndex` |
| `src/models/excel.types.ts` | `MappingValueType`, `CellValueResolution`, `ListBlockContext`, `RecordsetMetadata`, `FieldMetadata`, constants |
| `src/config/database.ts` | Auto-migration cho tất cả cột mới, backward compat |
| `src/services/excel-export.ts` | **Core refactor:** deterministic engine, `convertForExport()` theo `mapping.valueType`, `ListBlockManager` first-class |
| `src/services/hospital.service.ts` | Type detection cho preview/test-run (không dùng cho export) |
| `src/services/param-serializer.ts` | **MỚI:** pipeline `normalizeInputValue()` → `serializeByParamType()` → `serializeByValueMode()` |
| `src/services/date.service.ts` | Sửa `hh:mm:ss` → `HH:mm:ss` (24h) toàn bộ file |
| `src/services/excel.service.ts` | Sửa `hh:mm:ss` → `HH:mm:ss` (legacy consistency) |
| `src/services/auth.service.ts` | DB read/write đầy đủ trường mới cho `ReportParameters` và `ReportMappings` |
| `src/routes/report.routes.ts` | Serialize params → execute → deterministic export pipeline |

### Frontend
| File | Thay đổi |
|------|---------|
| `src/types/index.ts` | Frontend types khớp backend hoàn toàn |
| `src/api/report.api.ts` | API calls giữ nguyên, types khớp |
| `src/pages/ReportDesigner.tsx` | Full UI: 12 cột param config, 9 cột mapping config, multi-recordset tabs, `valueType` picker |

---

## 6. Data flow mới

### 6.1. Detect SP
```
Admin chọn SP
  → GET /api/system/sp-metadata/:spName
  → Backend đọc từ sys.dm_exec_describe_first_result_set
  → Trả về: parameters (name, type, nullable) + columns (name, type)
  → Admin thấy SQL metadata (sqlType, maxLength, precision, scale)
```

### 6.2. Config parameter
```
Admin nhìn thấy:
  - paramName (từ SP, readonly)
  - paramLabel (sửa được)
  - sqlType (readonly, gợi ý)
  - paramType: text / number / date / datetime / select / multiselect / textarea
  - valueMode: single / csv / json (quan trọng cho multiselect)
  - optionsSourceType: none / static / sql
  - options / optionsQuery (cho select/multiselect)
  - placeholder, defaultValue, isRequired
  → save → PUT /api/reports/:id/parameters
```

### 6.3. Run thử
```
Admin nhấn "Chạy thử"
  → POST /api/system/sp-metadata/test-run
  → Backend auto-set @TuNgay/@DenNgay nếu empty
  → Execute SP → recordsets[] + recordsetMetadata[]
  → Backend detect type CHO Preview (không dùng cho export)
  → Admin thấy: columns, rows, recordsetMetadata
  → Admin thấy tất cả recordsets (multi-recordset tabs)
```

### 6.4. Config mapping
```
Với mỗi recordset, admin cấu hình:
  - mappingType: param / scalar / list
  - sheetName: chọn sheet
  - recordsetIndex: chỉ rõ recordset nào
  - valueType: text / number / date / datetime ← QUYẾT ĐỊNH EXPORT
  - formatPattern: override format (nullable)
  - cellAddress: A10
→ save → PUT /api/reports/:id/mappings
```

### 6.5. Execute thật
```
User nhập params theo paramType:
  - date → date picker → serialize → '2024-01-01'
  - multiselect csv → chọn 3 khoa → '1,2,3'
  → GET /api/user/reports/:id/execute?TuNgay=2024-01-01&KhoaIds=1,2,3
  → Backend: serializeReportParams() → execute SP
```

### 6.6. Export (deterministic)
```
POST /api/user/reports/:id/export
  → Backend re-execute SP (fresh data)
  → Với từng mapping:
      if mappingType == 'param':
        raw = params[fieldName]
        valueType = mapping.valueType ?? 'text'
        → convertForExport(raw, valueType, formatPattern) → writeCell()
      if mappingType == 'scalar':
        raw = recordsets[recordsetIndex][0][fieldName]
        valueType = mapping.valueType ← TỪ CONFIG, KHÔNG ĐOÁN
        → convertForExport() → writeCell()
      if mappingType == 'list':
        data = recordsets[recordsetIndex]
        valueType = mapping.valueType ← TỪ CONFIG, KHÔNG ĐOÁN
        → block = getOrCreate(sheet, recordsetIndex, startRow, data.length)
        → spliceRows() ĐÚNG 1 LẦN cho block
        → với mỗi dòng: convertForExport() → writeCell()
  → wb.xlsx.writeBuffer()
```

---

## 7. Backward compatibility xử lý thế nào

### 7.1. Database
Auto-migration bằng `ALTER TABLE ADD COLUMN` với DEFAULT. Không DROP cột cũ. Không có breaking change.

### 7.2. ReportParameters cũ
```typescript
// getReportParameters() — backend
paramType: (p.paramType as any) ?? 'text',
valueMode: (p.valueMode as any) ?? 'single',
optionsSourceType: (p.optionsSourceType as any) ?? 'none',
// → hệ thống cũ vẫn chạy được, multiselect = single (lấy giá trị đầu)
```

### 7.3. ReportMappings cũ (KHÔNG có valueType)
```typescript
// excel-export.ts resolveValueType()
if (mapping.valueType) return mapping.valueType;  // 1. Config rõ → dùng ngay

// 2. Fallback: lookup từ metadata (backward compat, CHỈ cho scalar/list)
if (!mapping.valueType && mapping.mappingType !== 'param') {
  const detected = fieldTypeMap.get(`${rsIdx}|${fieldName}`);
  if (detected) return detected;
}

// 3. Safe fallback: 'text' — KHÔNG BAO GIỜ fallback date mạnh
return 'text';
```

**Nguyên tắc:** `valueType=null` → chỉ dùng metadata fallback cho scalar/list. Không bao giờ fallback "date" — `'text'` luôn an toàn hơn.

### 7.4. recordsetIndex cũ
```sql
ALTER TABLE ReportMappings ADD COLUMN recordsetIndex INTEGER DEFAULT 0;
```
→ Mapping cũ mặc định dùng recordset 0 (đầu tiên).

---

## 8. Checklist test thủ công nên chạy

### Case 1: Param ngày cơ bản
- [ ] Tạo report với `@TuNgay` (paramType=date, valueMode=single)
- [ ] Chạy với TuNgay = 2024-01-01
- [ ] Kiểm tra SP nhận đúng `2024-01-01`
- [ ] Export → ô TuNgay hiển thị đúng ngày (format `dd/MM/yyyy`)

### Case 2: Param multiselect dạng csv
- [ ] `@KhoaIds` → paramType=multiselect, valueMode=csv
- [ ] Chọn Khoa 1, 3, 5
- [ ] Kiểm tra SP nhận đúng `"1,3,5"`
- [ ] Report trả về đúng data của 3 khoa

### Case 3: Param multiselect dạng json
- [ ] `@DieuKien` → paramType=multiselect, valueMode=json
- [ ] Chọn 3 điều kiện
- [ ] Kiểm tra SP nhận đúng `'["a","b","c"]'`

### Case 4: Scalar number — không thành date
- [ ] Mapping: `BenhAn_Id` → valueType=number, cell A1
- [ ] Data: `BenhAn_Id = 5`
- [ ] Export → ô A1 = `5` (number), **không phải** `05/01/1900`

### Case 5: Scalar datetime
- [ ] Mapping: `NgayVaoVien` → valueType=datetime, cell A2
- [ ] Data: `NgayVaoVien = 2024-06-15 10:30:00`
- [ ] Export → ô A2 = serial + format `dd/MM/yyyy HH:mm:ss`

### Case 6: Multi-recordset + multi-sheet
- [ ] SP trả 2 recordsets
- [ ] Mapping RS0 → Sheet1, RS1 → Sheet2
- [ ] Export → Sheet1 = RS0, Sheet2 = RS1

### Case 7: List nhiều cột, nhiều dòng (20–100 rows)
- [ ] 5 cột list, 100 rows
- [ ] Export → 100 dòng, 5 cột thẳng hàng, không lệch
- [ ] Border, alignment, row height giữ nguyên
- [ ] numFmt đúng: ID=number, NgayVaoVien=datetime

### Case 8: Backward compat — mapping cũ không có valueType
- [ ] Sửa trực tiếp DB: UPDATE ReportMappings SET valueType=NULL WHERE id=?
- [ ] Export → không crash, fallback 'text' an toàn

### Case 9: Backward compat — param cũ không có valueMode
- [ ] Sửa trực tiếp DB: UPDATE ReportParameters SET valueMode=NULL WHERE id=?
- [ ] Chạy report → không crash, default = 'single'

---

*Cập nhật: 2026-04-01*
