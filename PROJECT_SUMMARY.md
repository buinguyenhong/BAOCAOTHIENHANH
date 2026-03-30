# HIS REPORTS - PROJECT SUMMARY
> File này chứa toàn bộ thông tin về dự án. Lưu lại để tham khảo khi cần.

---

## Vị trí Dự án
```
D:\Project\hospital-report-server\
```

## Mục tiêu dự án
Xây dựng hệ thống báo cáo nội bộ LAN cho bệnh viện, cho phép:
- Thiết kế, chạy và xuất báo cáo từ SQL Server (Stored Procedures)
- Dynamic SP Parameters (tự detect parameters từ sys schema)
- Auto fill @TuNgay/@DenNgay khi test run không có params
- Multi-recordsets: SP trả về nhiều result sets → hiển thị dropdown chọn, xuất Excel mỗi recordset ra sheet riêng
- Multi-result-set mappings: giữ mappings riêng cho từng result set
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
hospital-report-server/
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
│   │   ├── hooks/
│   │   │   └── useReports.ts
│   │   └── types/
│   └── dist/                        # Build output
│
└── README.md
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
| `ReportMappings` | Mapping cột → ô Excel (cellAddress, scalar/list, sheetName) |
| `ReportPermissions` | Quyền user × report (canView, canExport) |
| `AuditLogs` | Log hành động (LOGIN, RUN_REPORT, EXPORT...) |

### Schema chi tiết:

```sql
-- ReportMappings (đã có sheetName)
CREATE TABLE ReportMappings (
  id           TEXT PRIMARY KEY,
  reportId     TEXT NOT NULL,
  fieldName    TEXT NOT NULL,
  cellAddress  TEXT,
  mappingType  TEXT DEFAULT 'list',  -- 'scalar' | 'list'
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

### 2. Multi-Recordsets Support
- SP có thể trả về nhiều result sets
- Backend `testRun` trả về `recordsets[]` — mảng tất cả recordsets
- Frontend hiển thị dropdown chọn result set trong ReportDesigner
- Export Excel: mỗi recordset ghi vào sheet tương ứng (theo index hoặc sheetName)

### 3. Multi-Result-Set Mappings
- Mỗi result set có mappings riêng (`allResultSetMappings`)
- Khi chuyển result set → hiển thị mappings tương ứng
- Khi edit mapping → cập nhật cả formMappings và allResultSetMappings
- Khi save → gộp tất cả mappings từ mọi result sets

### 4. Excel Export (Multi-Sheet, Multi-Recordset)
- **Có template:** Load template .xlsx, giữ nguyên header/footer/template rows
- **Không template:** Tự tạo sheet "Báo cáo" + "Sheet2", "Sheet3"...
- **Multi-recordset:** Mỗi recordset index i → ghi vào workbook sheet i
- **Scalar mapping:** Ghi giá trị params vào 1 ô. Áp dụng lên **tất cả sheets**
- **List mapping (có sheetName):** Ghi dữ liệu vào sheet chỉ định
- **List mapping (không sheetName):** Ghi dữ liệu vào **tất cả sheets** với recordset 0
- Copy formatting từ template row → các dòng chèn mới
- Smart type detection (number vs text)
- Insert rows bằng `spliceRows()` (không dùng `insertRows` vì ExcelJS yêu cầu array)

### 5. Template Upload + Sheet Detection
- Khi upload file .xlsx, frontend dùng ExcelJS để parse và lấy danh sách sheet names
- Dropdown sheet trong tab Mapping cho phép chọn sheet đích cho mỗi mapping
- Auto-detect mappings khi chạy thử → tự gán `sheetName = availableSheets[0]`

### 6. Phân quyền
- Ma trận User × Report
- Checkbox: Xem / Xuất Excel
- Admin luôn có full quyền
- Bulk assign permissions

### 7. Audit Log
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

## Cách cài đặt

### 1. Backend
```bash
cd D:\Project\hospital-report-server\backend
npm install
# Sửa .env với thông tin SQL Server (HospitalDB)
npm run dev
```

### 2. Frontend
```bash
cd D:\Project\hospital-report-server\frontend
npm install
npm run build
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
   - Với mỗi result set → thiết lập mappings (scalar/list) + chọn sheet đích
   - Lưu báo cáo (tất cả mappings từ mọi result sets được lưu)
4. **Phân quyền** → Gán báo cáo cho user

### User workflow:
1. Đăng nhập
2. Chọn báo cáo → Nhập tham số (ngày tháng)
3. Nhấn **Chạy báo cáo** → Xem dữ liệu
4. Nhấn **Xuất Excel** → Tải file

---

## Lưu ý quan trọng

1. **ConfigDB** = SQLite (`backend/data/hisreports.db`) — lưu cấu hình app
2. **HospitalDB** = MSSQL — chỉ đọc/gọi SP, cấu hình trong `backend/config/hospital_db.json`
3. Có thể dùng **chung 1 SQL Server** cho HospitalDB
4. `sheetName` trong `ReportMappings` cho phép mapping vào bất kỳ sheet nào của template
5. SP trả về nhiều recordsets → mỗi recordset ghi vào sheet theo thứ tự
6. MSSQL driver cần strip `@` prefix khi binding parameters

---

*Cập nhật: 2026-03-31*