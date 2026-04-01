# BAOCAOTHIENHANH — Hệ thống Báo cáo Bệnh viện

Hệ thống báo cáo nội bộ chạy trên mạng LAN bệnh viện. Cho phép admin thiết kế báo cáo từ SQL Server Stored Procedures, cấu hình mapping chi tiết, và user chạy/export Excel với kết quả **deterministic** — đúng dữ liệu, đúng format, không đoán kiểu.

---

## 🏗️ Kiến trúc

```
┌─────────────────────────────────────────────────────────────────┐
│              Browser (LAN — http://localhost:5173)              │
│                  React 19 + Vite + Tailwind CSS                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API
┌────────────────────────────▼────────────────────────────────────┐
│                  Backend: Express.js (port 5000)                  │
│   Auth │ Reports │ Users │ System │ Excel Export (deterministic) │
└───────────┬────────────────────────────────────┬────────────────┘
            │                                    │
    ┌───────▼────────┐               ┌────────────▼────────────┐
    │   ConfigDB     │               │       HospitalDB         │
    │  hisreports   │               │  (Cơ sở dữ liệu HIS    │
    │  (SQLite)     │               │   bệnh viện — MSSQL)    │
    │               │               │                          │
    │  • Users      │               │   (Chỉ gọi Stored       │
    │  • Reports    │               │    Procedures)           │
    │  • Parameters │               │                          │
    │  • Mappings   │               │                          │
    │  • Permissions│               │                          │
    │  • AuditLogs  │               │                          │
    └───────────────┘               └───────────────────────────┘
```

---

## ✨ Tính năng chính

| Tính năng | Mô tả |
|-----------|--------|
| **Deterministic Export** | Export Excel hoàn toàn dựa trên `mapping.valueType` — không đoán kiểu từ dữ liệu runtime |
| **Config-Driven Parameters** | Admin cấu hình đầy đủ: text, number, date, datetime, select, multiselect, textarea; single/csv/json serialization |
| **Config-Driven Mapping** | Admin cấu hình rõ: `mappingType` (param/scalar/list), `recordsetIndex`, `valueType` (text/number/date/datetime), `formatPattern` |
| **Auto-detect SP Metadata** | Detect tham số, cột, kiểu từ `sys.dm_exec_describe_first_result_set` — chỉ dùng để gợi ý |
| **Multi-Recordset** | SP trả nhiều recordsets → mapping chỉ rõ recordset nào cho sheet nào |
| **Template Excel** | Upload template .xlsx, giữ nguyên layout, style, border, row height |
| **First-Class List Block** | Block = (sheetName + recordsetIndex + startRow), `spliceRows` 1 lần, row alignment đảm bảo |
| **Backward Compatibility** | Mapping cũ không có `valueType` → fallback `'text'` an toàn; auto-migration cột mới |
| **JWT + Phân quyền 3 lớp** | Action permissions (tạo/sửa/xóa) → Group view permissions → Report permissions (xem/xuất) |
| **Audit Logging** | Ghi log: login, chạy báo cáo, xuất file, CRUD |

---

## 📁 Cấu trúc dự án

```
hospital-report-server/
├── backend/
│   └── src/
│       ├── index.ts                   # Entry point (port 5000)
│       ├── config/
│       │   └── database.ts            # SQLite ConfigDB + MSSQL HospitalDB
│       ├── models/
│       │   ├── types.ts               # ReportParameter, ReportMapping đầy đủ
│       │   └── excel.types.ts         # MappingValueType, CellValueResolution, ListBlockContext
│       ├── routes/
│       │   ├── auth.routes.ts         # /api/auth/*
│       │   ├── report.routes.ts        # /api/user/reports/* + /api/reports/*
│       │   ├── user.routes.ts          # /api/users/*
│       │   └── system.routes.ts        # /api/system/*
│       ├── services/
│       │   ├── auth.service.ts        # Auth + ReportService (CRUD)
│       │   ├── hospital.service.ts    # SP execution + type detection (cho preview)
│       │   ├── excel-export.ts         # ⭐ Deterministic export engine
│       │   ├── excel.service.ts       # Legacy (giữ lại)
│       │   ├── param-serializer.ts    # ⭐ Param serialization pipeline
│       │   ├── date.service.ts         # Pure date/serial utilities
│       │   └── audit.service.ts        # Audit logging
│       ├── middleware/
│       │   ├── auth.middleware.ts      # JWT verification
│       │   └── permission.middleware.ts # Report-level guards
│       └── utils/
│           ├── jwt.ts                  # JWT helpers
│           ├── password.ts             # bcrypt helpers
│           └── normalize.ts            # Param/row name normalization
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Login.tsx               # Login page
│       │   ├── Dashboard.tsx           # User: chạy + export báo cáo
│       │   ├── ReportDesigner.tsx      # Admin: thiết kế báo cáo đầy đủ
│       │   ├── UserManagement.tsx      # Admin: CRUD users + groups
│       │   ├── PermissionManager.tsx    # Admin: ma trận phân quyền
│       │   └── SystemConfig.tsx        # Admin: cấu hình HospitalDB
│       ├── components/
│       │   ├── Sidebar.tsx             # Sidebar + report group tree
│       │   ├── Header.tsx              # Topbar
│       │   ├── DataTable.tsx            # Multi-recordset table
│       │   ├── ParameterForm.tsx        # Dynamic param form
│       │   └── ui/                     # Button, Input, Select, Modal, Card
│       ├── contexts/
│       │   ├── AuthContext.tsx          # Auth state
│       │   └── ToastContext.tsx         # Toast notifications
│       ├── hooks/
│       │   └── useReports.ts           # Report fetch/execute/export hook
│       ├── api/
│       │   ├── client.ts               # Axios instance + interceptors
│       │   ├── auth.api.ts             # Login/logout
│       │   ├── report.api.ts           # User + Admin + System API
│       │   └── user.api.ts            # User/group management
│       └── types/
│           └── index.ts                # Frontend TypeScript interfaces
│
├── templates/                          # Uploaded Excel templates (theo reportId)
├── data/
│   └── hisreports.db                  # SQLite ConfigDB
├── config/
│   └── hospital_db.json               # HospitalDB connection config
└── README.md
```

---

## 🔑 Nguyên tắc kiến trúc

### A. Deterministic Export — KHÔNG đoán kiểu khi export

```
Data flow export tuyệt đối:

SP execute → raw recordsets (Date objects → Excel serial)
                        ↓
             mapping.valueType ← NGUỒN SỰ THẬT DUY NHẤT
                        ↓
             convertForExport(raw, valueType, formatPattern)
                        ↓
             CellValueResolution { excelValue, formatKind, numFmt }
                        ↓
             writeCell() → Excel cell
```

**Đã loại bỏ hoàn toàn:**
- Heuristic detect date/datetime từ sample values cho export
- `dateColumns` global theo field name
- `smartType` đoán kiểu khi fill cell
- `fillParam/fillScalar/fillList` tự quyết type

**Cho phép (phục vụ preview/test-run):**
- Type detection trong `hospital.service.ts` — dùng để hiển thị preview
- Metadata kiểu trong `recordsetMetadata[]` — dùng để render table trước

### B. Mapping là nguồn sự thật cho export

```typescript
// ReportMapping.valueType quyết định tuyệt đối:
mapping.valueType = 'number'  → BenhAn_Id=5 → cell=5 (không bao giờ thành date)
mapping.valueType = 'datetime'→ NgayVaoVien → serial + 'dd/MM/yyyy HH:mm:ss'
mapping.valueType = 'text'    → luôn ghi string
mapping.valueType = 'date'   → serial + 'dd/MM/yyyy'
```

### C. Param config quyết định UI và serialization

```typescript
// ReportParameter quyết định:
paramType = 'multiselect' + valueMode = 'csv'  → User chọn nhiều → "1,2,3"
paramType = 'multiselect' + valueMode = 'json' → User chọn nhiều → '["a","b"]'
paramType = 'date'        → serialize → 'YYYY-MM-DD'
paramType = 'datetime'    → serialize → 'YYYY-MM-DD HH:mm:ss'
```

### D. List Block là first-class concept

```
Block key = sheetName | recordsetIndex | startRow
  • rowCount = DÙNG CHUNG cho mọi cột trong block
  • spliceRows = gọi ĐÚNG 1 LẦN cho mỗi block
  • Data mismatch → log warning, giữ alignment theo block.rowCount
```

---

## 🗄️ Schema

### ReportParameters

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| `id` | TEXT PK | UUID |
| `reportId` | TEXT FK | Báo cáo cha |
| `paramName` | TEXT | Tên tham số gốc SP (giữ `@`) |
| `paramLabel` | TEXT | Label hiển thị |
| `sqlType` | TEXT | Kiểu SQL từ SP metadata |
| `maxLength` | INTEGER | Độ dài max |
| `precision` | INTEGER | Precision |
| `scale` | INTEGER | Scale |
| `isNullable` | INTEGER | 0/1 |
| `hasDefaultValue` | INTEGER | 0/1 |
| `paramType` | TEXT | `text` \| `number` \| `date` \| `datetime` \| `select` \| `multiselect` \| `textarea` |
| `valueMode` | TEXT | `single` \| `csv` \| `json` |
| `optionsSourceType` | TEXT | `none` \| `static` \| `sql` |
| `options` | TEXT | JSON array `{value, label}` |
| `optionsQuery` | TEXT | SQL query lấy options |
| `placeholder` | TEXT | Placeholder input |
| `defaultValue` | TEXT | Giá trị mặc định |
| `isRequired` | INTEGER | 0/1 |
| `displayOrder` | INTEGER | Thứ tự |

### ReportMappings

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| `id` | TEXT PK | UUID |
| `reportId` | TEXT FK | Báo cáo cha |
| `fieldName` | TEXT | Tên field |
| `cellAddress` | TEXT | Ô Excel (VD: `A10`) |
| `mappingType` | TEXT | `param` \| `scalar` \| `list` |
| `displayOrder` | INTEGER | Thứ tự |
| `sheetName` | TEXT | Tên sheet |
| `recordsetIndex` | INTEGER | Chỉ định recordset (0=đầu tiên) |
| `valueType` | TEXT | `text` \| `number` \| `date` \| `datetime` ⭐ |
| `formatPattern` | TEXT | Override numFmt ⭐ |

---

## 🔌 API Reference

### User Routes
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| GET | `/api/user/reports` | Danh sách báo cáo được phép xem |
| GET | `/api/user/reports/:id` | Chi tiết báo cáo |
| GET | `/api/user/reports/:id/execute` | Chạy báo cáo |
| POST | `/api/user/reports/:id/export` | Export Excel (deterministic) |

### Admin Routes
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| GET | `/api/reports` | Tất cả báo cáo |
| POST | `/api/reports` | Tạo báo cáo |
| GET | `/api/reports/:id` | Chi tiết báo cáo |
| PUT | `/api/reports/:id` | Cập nhật báo cáo |
| DELETE | `/api/reports/:id` | Xóa báo cáo |
| PUT | `/api/reports/:id/parameters` | Cập nhật parameters |
| PUT | `/api/reports/:id/mappings` | Cập nhật mappings |
| GET | `/api/reports/:id/template/sheets` | Danh sách sheet template |
| PUT | `/api/reports/:id/template` | Upload template |

### System Routes
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| GET | `/api/system/stored-procedures` | Danh sách SP |
| GET | `/api/system/sp-metadata/:spName` | Metadata SP (params + columns) |
| POST | `/api/system/sp-metadata/test-run` | Execute SP thử |
| GET | `/api/system/connection-status` | Kiểm tra kết nối |
| POST | `/api/system/setup-connection` | Cấu hình HospitalDB |

### Auth Routes
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| POST | `/api/auth/login` | Đăng nhập → JWT |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Thông tin user |
| POST | `/api/auth/change-password` | Đổi mật khẩu |

---

## 🚀 Cài đặt & Chạy

```bash
# Backend
cd backend
npm install
npm run dev      # port 5000

# Frontend (development)
cd ../frontend
npm install
npm run dev      # port 5173, proxy → :5000
```

**Mặc định admin:** `admin / Admin@123`

---

## 📋 Hướng dẫn sử dụng (Admin)

### 1. Cấu hình HospitalDB
**Cấu hình hệ thống** → Nhập server, database, user, password → Lưu.

### 2. Tạo báo cáo
**Thiết kế báo cáo** → Tạo báo cáo mới:

**Tab Thông tin:** Tên, nhóm, chọn SP.

**Tab Tham số:** (tự động detect từ SP)
- `paramType` → loại UI nhập liệu
- `valueMode` → single / csv / json (cho multiselect)
- `optionsSourceType` → none / static / sql
- `defaultValue`, `placeholder`, `isRequired`

**Tab Mapping:** (chạy thử để thấy recordsets)
- `mappingType` → param (tham số) / scalar (1 ô) / list (nhiều dòng)
- `recordsetIndex` → chỉ rõ recordset nào
- `valueType` → **quyết định cách export** (text/number/date/datetime)
- `formatPattern` → override format (VD: `yyyy-MM-dd`)
- `cellAddress` → ô Excel

**Tab Template:** Upload file .xlsx làm template.

### 3. Phân quyền
**Phân quyền** → Gán quyền xem/xuất cho từng user.

---

## 📋 Hướng dẫn sử dụng (User)

1. Chọn báo cáo từ sidebar
2. Nhập tham số (date picker, select, multiselect…)
3. Nhấn **Chạy báo cáo** → xem kết quả
4. Nhấn **Xuất Excel** → file .xlsx đúng format

---

## 🔒 Bảo mật

- Password hash **bcryptjs** (10 rounds)
- JWT token **8 giờ**
- Phân quyền 3 lớp: action → group → report
- Audit log ghi mọi hành động
- HospitalDB chỉ gọi Stored Procedures (không raw SQL)

---

## 🛠️ Khắc phục lỗi thường gặp

| Lỗi | Nguyên nhân | Xử lý |
|-----|------------|--------|
| Kết nối SQL Server thất bại | TCP/IP chưa bật | Bật TCP/IP trong SQL Server Configuration Manager |
| Export ra số thành date | Mapping thiếu `valueType` | Thêm `valueType='number'` cho cột ID/số |
| Multiselect không gửi đúng | `valueMode` chưa đúng | Đặt `valueMode='csv'` hoặc `'json'` |
| Nhiều cột list bị lệch hàng | Có 2 mapping trỏ cùng 1 cột | Kiểm tra mỗi cột chỉ có 1 mapping |

---

## 📦 Công nghệ

| Lớp | Công nghệ |
|-----|-----------|
| Backend Runtime | Node.js 18+, TypeScript, tsx |
| Backend Framework | Express.js 4 |
| ConfigDB | SQLite 3 (better-sqlite3) |
| HospitalDB | MSSQL (tedious driver) |
| Auth | JWT + bcryptjs |
| Excel | ExcelJS |
| Frontend Framework | React 19 + Vite 6 |
| Styling | Tailwind CSS 3 |
| HTTP Client | Axios |
| Router | React Router DOM 7 |

---

## 📝 License

Nội bộ bệnh viện — Không sử dụng cho mục đích thương mại.
