# HIS REPORTS - PROJECT SUMMARY

> File này chứa toàn bộ thông tin về dự án. Lưu lại để tham khảo khi cần.

---

## 📂 Vị trí Dự án
```
D:\Project\hospital-report-server\
```

## 🎯 Mục tiêu dự án
Xây dựng hệ thống báo cáo nội bộ LAN cho bệnh viện, cho phép:
- Thiết kế, chạy và xuất báo cáo từ SQL Server (Stored Procedures)
- Dynamic SP Parameters (tự detect parameters từ sys schema)
- Phân quyền user xem báo cáo cụ thể
- Export Excel chính xác theo template + mapping
- JWT Authentication

---

## 🏗️ Kiến trúc

```
Browser (LAN Clients)
       │
       ▼
Backend: Express.js (port 5000) ──► ConfigDB (HISReports) - Users, Reports, Permissions
       │
       ▼
HospitalDB (Cơ sở dữ liệu HIS bệnh viện) - Chỉ gọi SP
```

---

## 📁 Cấu trúc thư mục (53 files)

```
hospital-report-server/
├── backend/                     # 18 files - Express.js API
│   ├── src/
│   │   ├── index.ts            # Entry point (port 5000)
│   │   ├── config/database.ts  # ConfigDB + HospitalDB connections
│   │   ├── routes/
│   │   │   ├── auth.routes.ts     # Login, logout, change password
│   │   │   ├── report.routes.ts   # CRUD + execute + export
│   │   │   ├── user.routes.ts     # User management + permissions
│   │   │   └── system.routes.ts   # SP discovery + connection config
│   │   ├── services/
│   │   │   ├── auth.service.ts       # JWT + bcrypt
│   │   │   ├── report.service.ts     # Report CRUD + permissions
│   │   │   ├── hospital.service.ts   # Execute SP + SP metadata
│   │   │   ├── excel.service.ts      # Export Excel with template
│   │   │   └── audit.service.ts      # Audit logging
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── permission.middleware.ts
│   │   └── models/types.ts
│   ├── templates/              # Excel template files
│   └── .env
│
├── frontend/                    # 29 files - React 19 + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx       # User view - run reports
│   │   │   ├── ReportDesigner.tsx   # Admin - create/edit reports
│   │   │   ├── UserManagement.tsx   # Admin - CRUD users
│   │   │   ├── PermissionManager.tsx # Admin - matrix permissions
│   │   │   └── SystemConfig.tsx     # Admin - DB connection
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── ParameterForm.tsx
│   │   │   └── ui/ (Button, Input, Select, Modal, Card)
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx
│   │   │   └── ToastContext.tsx
│   │   ├── api/ (client, auth, report, user)
│   │   └── types/index.ts
│   └── vite.config.ts
│
├── scripts/
│   └── init_configdb.sql        # Script tạo database HISReports
│
├── README.md
└── PROJECT_SUMMARY.md          # File này
```

---

## 🔌 Database Schema (ConfigDB = HISReports)

### 5 Bảng chính:

| Bảng | Mục đích |
|------|----------|
| `Users` | Tài khoản người dùng (id, username, password hash, role) |
| `Reports` | Cấu hình báo cáo (name, spName, group, template) |
| `ReportParameters` | Tham số của báo cáo (paramName, paramType, defaultValue) |
| `ReportMappings` | Mapping cột → ô Excel (cellAddress, scalar/list) |
| `ReportPermissions` | Quyền user × report (canView, canExport) |
| `AuditLogs` | Log hành động (LOGIN, RUN_REPORT, EXPORT...) |

---

## 👤 Tài khoản mặc định

| Username | Password | Vai trò |
|----------|----------|---------|
| `admin` | `Admin@123` | Quản trị viên (toàn quyền) |
| `user` | `User@123` | Người dùng (chỉ xem báo cáo được gán) |

---

## 🚀 Cách cài đặt

### 1. Chạy Init Script
```sql
-- Mở SQL Server Management Studio
-- Chạy file: scripts/init_configdb.sql
```

### 2. Cài Backend
```bash
cd D:\hospital-report-server\backend
npm install
# Sửa .env với thông tin SQL Server
npm run dev
```

### 3. Build & Run Frontend
```bash
cd D:\hospital-report-server\frontend
npm install
npm run build
```

### 4. Khởi động Server
```bash
cd D:\hospital-report-server\backend
npm run dev
```

### 5. Truy cập
```
http://localhost:5000
```

---

## 🌍 Deploy lên LAN (192.168.1.150 - BAOCAOPC)

### Cấu hình .env
```env
HOST=0.0.0.0
PORT=5000
CONFIGDB_SERVER=localhost
CONFIGDB_DATABASE=HISReports
CONFIGDB_USER=sa
CONFIGDB_PASSWORD=YourPassword
HOSPITALDB_SERVER=localhost
HOSPITALDB_DATABASE=HospitalDB
```

### Bật SQL Server TCP/IP
```
SQL Server Configuration Manager → Protocols → TCP/IP Enabled
Restart SQL Server
```

### Mở Firewall
```powershell
netsh advfirewall set allprofiles state off
# Hoặc mở port cụ thể:
netsh advfirewall firewall add rule name="HIS Reports" dir=in action=allow protocol=tcp localport=5000
```

### Gán Domain Alias
Trên **mỗi máy trạm**, sửa `C:\Windows\System32\drivers\etc\hosts` (Admin):
```ini
192.168.1.150   baocaothienhanh.cntt
```

### Truy cập
| URL | Mô tả |
|-----|--------|
| `http://192.168.1.150:5000` | Theo IP |
| `http://baocaothienhanh.cntt:5000` | Theo alias (nếu đã sửa hosts) |
| `http://BAOCAOPC:5000` | Theo tên máy |

---

## 📌 Các tính năng chính

### 1. Dynamic SP Parameters
- Tự động detect parameters từ `sys.dm_exec_describe_first_result_set_for_object`
- Hỗ trợ types: `text`, `date`, `number`, `select`
- Có thể chỉnh sửa label, default value, required

### 2. Excel Export
- Load template .xlsx (giữ header/footer)
- Điền scalar values (1 ô)
- Chèn rows động cho list mappings
- Copy formatting từ template row
- Smart type detection (number vs text)

### 3. Phân quyền
- Ma trận User × Report
- Checkbox: Xem / Xuất Excel
- Admin luôn có full quyền
- Bulk assign permissions

### 4. Audit Log
Ghi lại: LOGIN, LOGOUT, RUN_REPORT, EXPORT_REPORT, CREATE/UPDATE/DELETE_REPORT, CREATE/UPDATE/DELETE_USER, SET_PERMISSION

---

## 🛠️ API Endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

### User (theo quyền)
- `GET /api/user/reports`
- `GET /api/user/reports/:id/execute`
- `POST /api/user/reports/:id/export`

### Admin
- `GET/POST/PUT/DELETE /api/reports`
- `GET/POST/PUT/DELETE /api/users`
- `PUT /api/users/:id/permissions`
- `GET /api/system/stored-procedures`
- `GET /api/system/sp-metadata/:spName`
- `POST /api/system/setup-connection`

---

## ⚠️ Lưu ý quan trọng

1. **HospitalDB** = Cơ sở dữ liệu HIS bệnh viện (chỉ đọc/gọi SP)
2. **ConfigDB** = Database HISReports (lưu cấu hình app)
3. Có thể dùng **chung 1 SQL Server** cho cả 2 database
4. Nếu SQL Server trên **máy khác** → đổi IP trong .env
5. Chạy nền 24/7: `npm install -g pm2` → `pm2 start npm --name his-reports -- run dev`

---

## 📞 Cách sử dụng nhanh

### Admin workflow:
1. Đăng nhập `admin/Admin@123`
2. Vào **Cấu hình hệ thống** → Nhập thông tin HospitalDB → Test
3. Vào **Thiết kế báo cáo** → Tạo mới → Chọn SP → Tự động load params & mappings → Lưu
4. Vào **Phân quyền** → Gán báo cáo cho user → Lưu

### User workflow:
1. Đăng nhập
2. Chọn báo cáo từ sidebar
3. Nhập tham số (ngày tháng...)
4. Nhấn **Chạy báo cáo**
5. Nhấn **Xuất Excel**

---

*Cập nhật: 2026-03-26*
