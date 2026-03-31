# HIS REPORTS - PROJECT SUMMARY
> File này chứa toàn bộ thông tin về dự án. Lưu lại để tham khảo khi cần.

---

## Vị trí Dự án
```
D:\Project\BAOCAOTHIENHANH\BAOCAOTHIENHANH\
```

## Mục tiêu dự án
Xây dựng hệ thống báo cáo nội bộ LAN cho bệnh viện, cho phép:
- Thiết kế, chạy và xuất báo cáo từ SQL Server (Stored Procedures)
- Dynamic SP Parameters (tự detect parameters từ sys schema)
- Auto fill @TuNgay/@DenNgay khi test run không có params
- Multi-recordsets: SP trả về nhiều result sets → hiển thị dropdown chọn, xuất Excel mỗi recordset ra sheet riêng
- Multi-result-set mappings: giữ mappings riêng cho từng result set
- 3 loại mapping: **Giá trị đơn (scalar)**, **Danh sách (list)**, **Tham số (param)**
- Phân quyền user xem báo cáo cụ thể
- Export Excel chính xác theo template + mapping (multi-sheet, multi-recordset)
- Upload file template Excel mẫu (multi-sheet)
- JWT Authentication

---

## Kiến trúc

```
Browser (LAN Clients)
       │
       ▼
Backend: Express.js (port 5000)
       │
       ├── ConfigDB (SQLite) - HISReports.db - Users, Reports, Permissions, AuditLogs
       │
       ▼
HospitalDB (MSSQL) - Chỉ gọi SP, cấu hình qua SystemConfig
```

---

## Cấu trúc thư mục

```
BAOCAOTHIENHANH/
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Entry point (port 5000)
│   │   ├── config/
│   │   │   └── database.ts         # SQLite ConfigDB + MSSQL HospitalDB
│   │   ├── routes/
│   │   │   ├── auth.routes.ts      # Login, logout, change password
│   │   │   ├── report.routes.ts     # CRUD + execute + export
│   │   │   ├── user.routes.ts       # User management + permissions
│   │   │   └── system.routes.ts     # SP discovery + connection config
│   │   ├── services/
│   │   │   ├── auth.service.ts      # JWT + bcrypt + ReportService
│   │   │   ├── hospital.service.ts  # Execute SP + SP metadata
│   │   │   ├── excel.service.ts     # Export Excel multi-sheet/multi-recordset
│   │   │   └── audit.service.ts     # Audit logging
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── permission.middleware.ts
│   │   ├── models/
│   │   │   └── types.ts
│   │   └── utils/
│   │       ├── jwt.ts
│   │       └── password.ts
│   ├── data/
│   │   └── hisreports.db           # SQLite database
│   ├── config/
│   │   └── hospital_db.json        # HospitalDB connection config
│   ├── templates/                   # Excel template files
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx        # User view - run reports
│   │   │   ├── ReportDesigner.tsx   # Admin - create/edit reports
│   │   │   ├── UserManagement.tsx
│   │   │   ├── PermissionManager.tsx
│   │   │   └── SystemConfig.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── ParameterForm.tsx
│   │   │   └── ui/ (Button, Input, Select, Modal, Card)
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx
│   │   │   └── ToastContext.tsx
│   │   ├── api/
│   │   │   └── report.api.ts
│   │   ├── hooks/
│   │   │   └── useReports.ts
│   │   └── types/
│   │       └── index.ts
│   └── dist/                        # Build output
│
└── PROJECT_SUMMARY.md
```

---

## Database Schema (SQLite = ConfigDB)

**File:** `backend/data/hisreports.db`
**Engine:** better-sqlite3 (synchronous, WAL mode, foreign_keys ON)

### 6 Bảng chính:

| Bảng | Mục đích |
|------|----------|
| `Users` | Tài khoản người dùng (id, username, password hash, role) |
| `Reports` | Cấu hình báo cáo (name, spName, group, templateFile) |
| `ReportParameters` | Tham số của báo cáo (paramName, paramType, defaultValue) |
| `ReportMappings` | Mapping cột → ô Excel (cellAddress, scalar/list/param, sheetName) |
| `ReportPermissions` | Quyền user × report (canView, canExport) |
| `AuditLogs` | Log hành động (LOGIN, RUN_REPORT, EXPORT...) |

### Schema chi tiết:

```sql
CREATE TABLE ReportMappings (
  id           TEXT PRIMARY KEY,
  reportId     TEXT NOT NULL,
  fieldName    TEXT NOT NULL,
  cellAddress  TEXT,
  mappingType  TEXT DEFAULT 'list',  -- 'scalar' | 'list' | 'param'
  displayOrder INTEGER DEFAULT 0,
  sheetName    TEXT,                  -- sheet đích, null = first sheet
  FOREIGN KEY (reportId) REFERENCES Reports(id) ON DELETE CASCADE
);
```

### Migration tự động:
- Tự động thêm cột `sheetName` nếu chưa có khi khởi động

---

## Tài khoản mặc định

| Username | Password | Vai trò |
|----------|----------|---------|
| `admin` | `Admin@123` | Quản trị viên (toàn quyền) |
| `user` | `User@123` | Người dùng (chỉ xem báo cáo được gán) |

---

## Các tính năng chính

### 1. Dynamic SP Parameters + Auto @TuNgay/@DenNgay
- Tự động detect parameters từ `sys.dm_exec_describe_first_result_set_for_object`
- Khi test run không có params → tự gán `@TuNgay` = đầu tháng, `@DenNgay` = hôm nay (format YYYY-MM-DD)
- MSSQL driver: strip `@` prefix khi binding params
- Hỗ trợ types: `text`, `date`, `number`, `select`

### 2. 3 Loại Mapping
- **Giá trị đơn (scalar):** Chỉ map giá trị, không điền tên. Ví dụ: `TONGSOCANHAPVIEN : A10` → chỉ truyền giá trị tính ra vào ô A10.
- **Danh sách (list):** Ô được map là ô đầu tiên của cột. Ví dụ: `BENHNHAN_ID : A4` → giá trị đầu tiên vào A4, giá trị tiếp theo vào A5, A6... cho đến hết.
- **Tham số (param):** Tham số được detect tự động từ SP parameters, tạo trong bảng mapping với type `param`, có thể chọn ô để gắn hoặc để trống.

### 3. Multi-Recordsets Support
- SP có thể trả về nhiều result sets
- Backend `testRun` trả về `recordsets[]` — mảng tất cả recordsets
- Frontend hiển thị dropdown chọn result set trong ReportDesigner
- Export Excel: mỗi recordset ghi vào sheet tương ứng (theo index hoặc sheetName)

### 4. Multi-Result-Set Mappings
- Mỗi result set có mappings riêng (`allResultSetMappings`)
- Khi chuyển result set → hiển thị mappings tương ứng
- Khi edit mapping → cập nhật cả formMappings và allResultSetMappings
- Khi save → gộp tất cả mappings từ mọi result sets

### 5. Excel Export (Multi-Sheet, Multi-Recordset)
- **Có template:** Load template .xlsx, giữ nguyên header/footer/template rows (font, border, fill, alignment, number format, protection)
- **Không template:** Tự tạo sheet "Báo cáo" + "Sheet2", "Sheet3"...
- **Row tracker per sheet:** `_sheetRowTracker` đảm bảo tất cả list columns trong cùng sheet bắt đầu cùng dòng và tăng đều, không chèn đè lên nhau
- **Scalar/param mapping:** Chỉ fill trên đúng sheet được chỉ định (hoặc sheet đầu tiên nếu không chỉ định), không fill trùng lên mọi sheets
- **Param key matching:** Tự động strip `@` prefix để khớp với params object key (`@TuNgay` → `TuNgay`)
- **Smart type detection:** Tự nhận diện number vs text
- **Preserve template formatting:** Snapshot style trước khi ghi value, restore sau — giữ nguyên font, border, fill, alignment, number format

### 6. Sheet Selection Persistence
- Khi edit báo cáo đã có template: gọi `GET /reports/:id/template/sheets` để load danh sách sheets từ file template
- Dropdown sheet trong tab Mapping hiển thị đúng sheets đã chọn trước đó
- Không còn reset về "Mặc định (sheet 1)" khi mở lại báo cáo

### 7. Template Upload + Sheet Detection
- Khi upload file .xlsx, frontend dùng ExcelJS để parse và lấy danh sách sheet names
- Dropdown sheet trong tab Mapping cho phép chọn sheet đích cho mỗi mapping
- Auto-detect mappings khi chạy thử → tự gán `sheetName = availableSheets[0]`

### 8. Phân quyền
- Ma trận User × Report
- Checkbox: Xem / Xuất Excel
- Admin luôn có full quyền
- Bulk assign permissions

### 9. Audit Log
Ghi lại: LOGIN, LOGOUT, RUN_REPORT, EXPORT_REPORT, CREATE/UPDATE/DELETE_REPORT, CREATE/UPDATE/DELETE_USER, SET_PERMISSION, UPDATE_CONFIG

---

## API Endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

### User (theo quyền)
- `GET /api/user/reports` — Danh sách báo cáo được phép xem
- `GET /api/user/reports/:id` — Chi tiết báo cáo
- `GET /api/user/reports/:id/execute` — Chạy báo cáo, trả về `{ columns, rows, recordsets }`
- `POST /api/user/reports/:id/export` — Xuất Excel (body: `{ recordsets, params }`)

### Admin
- `GET/POST/PUT/DELETE /api/reports`
- `GET /api/reports/:id/template/sheets` — Lấy danh sách sheet từ template file (mới)
- `PUT /api/reports/:id/parameters`
- `PUT /api/reports/:id/mappings` — Lưu mappings kèm sheetName
- `PUT /api/reports/:id/template` — Upload template file

### System
- `GET /api/system/stored-procedures`
- `GET /api/system/sp-metadata/:spName`
- `POST /api/system/sp-metadata/test-run` — Chạy thử SP, trả về `{ columns, rows, params, recordsets }`
- `GET /api/system/connection-status`
- `POST /api/system/setup-connection`

---

## Các file thay đổi trong ngày (2026-03-31)

| File | Thay đổi |
|------|----------|
| `frontend/tsconfig.node.json` | Thêm `"composite": true` |
| `frontend/package.json` | Thêm `terser` |
| `frontend/src/api/report.api.ts` | Thêm `getTemplateSheets()` API |
| `frontend/src/pages/ReportDesigner.tsx` | Fix sheet persistence, thêm param mapping, fix auto-detect strip `@` |
| `frontend/src/types/index.ts` | Thêm `'param'` vào `MappingType` |
| `backend/src/models/types.ts` | Thêm `'param'` vào `MappingType` |
| `backend/src/routes/report.routes.ts` | Thêm endpoint `GET /reports/:id/template/sheets` |
| `backend/src/services/auth.service.ts` | Thêm `getTemplateSheets()` |
| `backend/src/services/excel.service.ts` | Viết lại export: rowTracker, param key matching, preserve formatting |

---

## Cách cài đặt

### 1. Backend
```bash
cd D:\Project\BAOCAOTHIENHANH\BAOCAOTHIENHANH\backend
npm install
npm run build
# Sửa .env với thông tin SQL Server (HospitalDB)
npm run dev
```

### 2. Frontend
```bash
cd D:\Project\BAOCAOTHIENHANH\BAOCAOTHIENHANH\frontend
npm install
npm run build
npm run dev
```

---

## Deploy LAN

### Cấu hình .env
```env
HOST=0.0.0.0
PORT=5000
```

### Mở Firewall
```powershell
netsh advfirewall firewall add rule name="HIS Reports" dir=in action=allow protocol=tcp localport=5000
```

### Truy cập
| URL | Mô tả |
|-----|-------|
| `http://localhost:5000` | Local |
| `http://192.168.x.x:5000` | Theo IP |

---

## Workflow

### Admin workflow:
1. Đăng nhập `admin/Admin@123`
2. **Cấu hình hệ thống** → Nhập thông tin HospitalDB → Test connection
3. **Thiết kế báo cáo**:
   - Tạo mới → Chọn SP → **Chạy thử** (auto fill @TuNgay/@DenNgay)
   - Nếu SP trả về nhiều recordsets → dùng dropdown chọn result set
   - Upload template .xlsx → sheet names được parse tự động
   - Với mỗi result set → thiết lập mappings:
     - **Danh sách (list):** map cột dữ liệu, chọn sheet đích
     - **Giá trị đơn (scalar):** map giá trị tính toán, chọn sheet
     - **Tham số (param):** nhấn "Detect tham số" hoặc thêm thủ công, map vào ô mong muốn
   - Lưu báo cáo (tất cả mappings từ mọi result sets được lưu)
4. **Phân quyền** → Gán báo cáo cho user

### User workflow:
1. Đăng nhập
2. Chọn báo cáo → Nhập tham số (ngày tháng)
3. Nhấn **Chạy báo cáo** → Xem dữ liệu
4. Nhấn **Xuất Excel** → Tải file (template formatting được giữ nguyên, dữ liệu điền đúng sheet/cột)

---

## Lưu ý quan trọng

1. **ConfigDB** = SQLite (`backend/data/hisreports.db`) — lưu cấu hình app
2. **HospitalDB** = MSSQL — chỉ đọc/gọi SP, cấu hình trong `backend/config/hospital_db.json`
3. Có thể dùng **chung 1 SQL Server** cho HospitalDB
4. `sheetName` trong `ReportMappings` cho phép mapping vào bất kỳ sheet nào của template
5. SP trả về nhiều recordsets → mỗi recordset ghi vào sheet theo thứ tự
6. MSSQL driver cần strip `@` prefix khi binding parameters
7. **Param mapping:** `fieldName` trong mapping nên không có `@` để khớp với params object key. Backend tự strip `@` khi tìm giá trị.

---

## Bug đã fix (2026-03-31)

1. **Sheet selection bị reset:** Khi mở báo cáo để sửa, dropdown sheet luôn về "Mặc định (sheet 1)" → Đã fix bằng cách gọi API load sheets từ template file.
2. **Sheet selection bị xóa khi lưu:** `allResultSetMappings` bị reset rỗng khi mở edit form → Đã fix bằng cách rebuild từ `report.mappings` đã lưu trong DB.
3. **Dữ liệu list mapping đè nhau:** Nhiều cột list cùng bắt đầu dòng 4 nhưng chèn dòng riêng lẻ → Đã fix bằng `_sheetRowTracker` per sheet.
4. **Scalar/param bị fill trùng trên mọi sheets:** Scalar luôn ghi lên mọi sheet → Đã fix chỉ fill đúng sheet được chỉ định.
5. **Param mapping không điền được giá trị:** `@TuNgay` không khớp với params key `TuNgay` → Đã fix strip `@` prefix khi tìm giá trị.
6. **Template formatting bị mất:** Font, màu, border bị reset khi ghi giá trị → Đã fix bằng snapshot/restore style trước và sau khi ghi.
7. **Frontend build lỗi:** Thiếu `composite: true` trong tsconfig.node.json và thiếu `terser` → Đã fix.

---

*Cập nhật: 2026-03-31*
