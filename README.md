# HIS Reports - Hệ thống Quản lý Báo cáo Bệnh viện

Hệ thống báo cáo nội bộ dành cho mạng LAN của bệnh viện. Cho phép thiết kế, chạy và xuất báo cáo từ SQL Server (Stored Procedures) với phân quyền người dùng chi tiết.

---

## 🏗️ Kiến trúc

```
┌──────────────────────────────────────────────────────────────┐
│              Browser (LAN - http://localhost:5173)            │
│                 React 19 + Vite + Tailwind CSS             │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST API
┌───────────────────────────▼──────────────────────────────────┐
│              Backend: Express.js (port 5000)                   │
│  Auth │ Reports │ Users │ System │ Excel Export               │
└───────────┬──────────────────────┬───────────────────────────┘
            │                      │
    ┌───────▼────────┐    ┌───────▼────────────┐
    │   ConfigDB     │    │   HospitalDB       │
    │  HISReports    │    │  (Cơ sở dữ liệu   │
    │  - Users       │    │   HIS bệnh viện)   │
    │  - Reports     │    │                    │
    │  - Permissions │    │  (Chỉ gọi SP)      │
    │  - AuditLogs   │    │                    │
    └────────────────┘    └────────────────────┘
```

---

## ✨ Tính năng chính

| Tính năng | Mô tả |
|-----------|--------|
| **JWT Authentication** | Đăng nhập bằng username/password, token 8h |
| **Dynamic SP Parameters** | Tự detect parameters từ `sys.dm_exec_describe_first_result_set` |
| **Template Excel Export** | Xuất file .xlsx giữ nguyên template + copy formatting |
| **Phân quyền User × Report** | Ma trận quyền: xem + xuất Excel cho từng báo cáo |
| **Audit Logging** | Ghi log mọi hành động: login, chạy báo cáo, xuất file... |
| **Admin Panel** | CRUD báo cáo, quản lý users, phân quyền, cấu hình |
| **Modern UI** | React + Tailwind CSS, responsive, Toast notifications |

---

## 📁 Cấu trúc dự án

```
hospital-report-server/
├── backend/                    # Express.js API
│   ├── src/
│   │   ├── index.ts           # Entry point (port 5000)
│   │   ├── config/            # Database connections
│   │   ├── routes/            # API routes
│   │   ├── controllers/       # Request handlers
│   │   ├── services/          # Business logic
│   │   ├── middleware/        # Auth, permission
│   │   ├── models/            # TypeScript types
│   │   └── utils/             # JWT, password helpers
│   ├── templates/             # Excel template files
│   └── .env                   # Configuration
│
├── frontend/                   # React + Vite
│   ├── src/
│   │   ├── pages/             # Page components
│   │   ├── components/        # UI components
│   │   ├── contexts/          # Auth, Toast contexts
│   │   ├── hooks/             # Custom hooks
│   │   ├── api/               # Axios API client
│   │   └── types/             # TypeScript types
│   └── vite.config.ts         # Proxy to backend
│
├── scripts/
│   └── init_configdb.sql     # Database init script
│
└── README.md
```

---

## 🚀 Cài đặt & Chạy

### Bước 1: Cài đặt SQL Server - Chạy Init Script

1. Mở **SQL Server Management Studio (SSMS)**
2. Kết nối SQL Server instance của bạn
3. Mở file `scripts/init_configdb.sql`
4. Execute toàn bộ script

Script sẽ tạo:
- Database `HISReports`
- 5 bảng: `Users`, `Reports`, `ReportParameters`, `ReportMappings`, `ReportPermissions`, `AuditLogs`
- 2 users mặc định: `admin/Admin@123` và `user/User@123`

### Bước 2: Cấu hình Backend

```bash
cd hospital-report-server/backend
```

Chỉnh sửa file `.env`:

```env
PORT=5000
HOST=0.0.0.0
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=8h

# ConfigDB (HISReports - chạy init script ở trên)
CONFIGDB_SERVER=localhost
CONFIGDB_DATABASE=HISReports
CONFIGDB_USER=sa
CONFIGDB_PASSWORD=YourPassword

# HospitalDB (Cơ sở dữ liệu HIS bệnh viện)
# Cấu hình này sẽ được ghi qua UI sau khi chạy app
HOSPITALDB_SERVER=localhost
HOSPITALDB_DATABASE=HospitalDB
HOSPITALDB_USER=sa
HOSPITALDB_PASSWORD=YourPassword
```

### Bước 3: Cài đặt Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### Bước 4: Build Frontend cho Production

```bash
cd frontend
npm run build
```

### Bước 5: Chạy Backend (serve cả API + Frontend)

```bash
cd backend
npm run dev
```

Backend chạy tại: `http://localhost:5000`
Frontend (sau build): `http://localhost:5000` (cùng port)

**Hoặc chạy riêng** (development):
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
# Truy cập: http://localhost:5173
```

---

## 🌍 Triển khai trên mạng LAN (192.168.1.150)

### Mô hình

```
┌─────────────────────────────────────────────────────────┐
│  Máy Server: BAOCAOPC (192.168.1.150)                  │
│  ├── Backend: http://0.0.0.0:5000                        │
│  └── Frontend: http://0.0.0.0:5000 (static files)       │
└──────────────────────┬──────────────────────────────────┘
                       │ LAN (192.168.1.x)
         ┌─────────────▼─────────────┐
         │  Máy trạm (Doctor/Admin) │
         │  http://192.168.1.150:5000 │
         └────────────────────────────┘
```

### 1. Đặt IP tĩnh cho máy Server

```
Windows Settings → Network & Internet → Ethernet → Properties
→ IPv4: 192.168.1.150 / Subnet: 255.255.255.0 / Gateway: 192.168.1.1
```

### 2. Bật SQL Server TCP/IP

```
SQL Server Configuration Manager
→ SQL Server Network Configuration → Protocols for MSSQLSERVER
→ TCP/IP → Enabled → Properties → IP Addresses
→ TCP Port: 1433, IP All: 1433
→ Restart SQL Server Service
```

### 3. Tắt Windows Firewall (hoặc mở port)

```powershell
# Tắt Firewall (đơn giản nhất cho mạng LAN nội bộ)
netsh advfirewall set allprofiles state off

# Hoặc mở port cụ thể:
netsh advfirewall firewall add rule name="HIS Reports API" dir=in action=allow protocol=tcp localport=5000
netsh advfirewall firewall add rule name="HIS SQL Server" dir=in action=allow protocol=tcp localport=1433
```

### 4. Cấu hình HOST trong .env

```env
HOST=0.0.0.0
PORT=5000
```

### 5. Truy cập từ máy khác

```
# Theo IP
http://192.168.1.150:5000

# Theo tên máy (nếu DNS cho phép)
http://BAOCAOPC:5000
```

---

## 🌐 Gán Domain Alias (baocaothienhanh.cntt)

### Cách 1: Sửa file hosts trên từng máy (ĐƠN GIẢN NHẤT)

Mở file `C:\Windows\System32\drivers\etc\hosts` bằng Notepad (Run as Administrator):

```ini
# Thêm vào cuối file:
192.168.1.150   baocaothienhanh.cntt
192.168.1.150   baocaothienhanh
```

Sau đó truy cập: `http://baocaothienhanh.cntt:5000`

### Cách 2: Cấu hình DNS Server (NÂNG CAO)

Nếu bệnh viện có **DNS Server** (ví dụ: Windows Server AD):

```
DNS Manager → Forward Lookup Zones → cntt
→ New Host (A or AAAA)
  Name: baocaothienhanh
  IP Address: 192.168.1.150
```

Tất cả máy join domain sẽ tự resolve.

### Cách 3: DNS trong router (nếu có)

```
Router DNS Settings → Static DNS Records
Domain: baocaothienhanh.cntt → IP: 192.168.1.150
```

### ⚠️ Lưu ý về Port

Nếu muốn bỏ port (dùng port 80 mặc định HTTP):

```env
PORT=80
```

Hoặc dùng IIS Reverse Proxy:
```
URL Rewrite + ARR (Application Request Routing)
→ Forward requests to http://localhost:5000
```

---

## 👤 Đăng nhập

| Username | Password | Vai trò |
|---------|----------|---------|
| `admin` | `Admin@123` | Quản trị viên (toàn quyền) |
| `user` | `User@123` | Người dùng (chỉ xem báo cáo được gán) |

---

## 📋 Hướng dẫn sử dụng

### 1. Admin: Cấu hình kết nối HospitalDB

1. Đăng nhập với tài khoản `admin`
2. Vào **Cấu hình hệ thống** (sidebar)
3. Nhập Server, Database, User, Password của SQL Server chứa dữ liệu HIS
4. Nhấn **Lưu & Kiểm tra kết nối**

### 2. Admin: Tạo báo cáo mới

1. Vào **Thiết kế báo cáo**
2. Nhấn **Tạo báo cáo mới**
3. Điền thông tin: Tên, Nhóm, chọn **Stored Procedure**
4. Tab **Tham số**: Tự động load từ SP, có thể chỉnh sửa label/type/default
5. Tab **Mapping**: Map cột dữ liệu → ô Excel (scalar/list)
6. Nhấn **Tạo báo cáo**

### 3. Admin: Phân quyền

1. Vào **Phân quyền**
2. Bảng ma trận: hàng = người dùng, cột = báo cáo
3. Check ✓ Xem / ✓ Xuất Excel cho từng user
4. Nhấn **Lưu phân quyền**

### 4. User: Chạy báo cáo

1. Chọn báo cáo từ sidebar
2. Nhập tham số (ngày tháng, mã khoa...)
3. Nhấn **Chạy báo cáo** → xem dữ liệu trên bảng
4. Nhấn **Xuất Excel** → tải file .xlsx

---

## 🔌 API Reference

### Authentication
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| POST | `/api/auth/login` | Đăng nhập → JWT token |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Thông tin user hiện tại |
| POST | `/api/auth/change-password` | Đổi mật khẩu |

### User Routes (theo quyền)
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| GET | `/api/user/reports` | Danh sách báo cáo được phép |
| GET | `/api/user/reports/:id/execute` | Chạy báo cáo |
| POST | `/api/user/reports/:id/export` | Export Excel |

### Admin Routes
| Method | Endpoint | Mô tả |
|--------|----------|--------|
| GET | `/api/reports` | Tất cả báo cáo |
| POST | `/api/reports` | Tạo báo cáo |
| PUT | `/api/reports/:id` | Cập nhật báo cáo |
| DELETE | `/api/reports/:id` | Xóa báo cáo |
| GET | `/api/users` | Danh sách users |
| POST | `/api/users` | Tạo user |
| PUT | `/api/users/:id/permissions` | Gán quyền |
| GET | `/api/system/stored-procedures` | Danh sách SP |
| GET | `/api/system/sp-metadata/:spName` | Metadata SP |

---

## 📦 Công nghệ

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js 4
- **Database:** mssql (SQL Server)
- **Auth:** JWT + bcryptjs
- **Excel:** exceljs
- **Language:** TypeScript (tsx for dev)

### Frontend
- **Framework:** React 19
- **Build:** Vite 6
- **Styling:** Tailwind CSS 3
- **HTTP:** Axios
- **Router:** React Router DOM 7
- **Language:** TypeScript

---

## 🔒 Bảo mật

- Password được hash bằng **bcryptjs** (10 rounds)
- JWT token có thời hạn **8 giờ**
- Permission middleware kiểm tra quyền trước mọi thao tác
- Audit log ghi lại mọi hành động
- Khuyến nghị: dùng HTTPS trong môi trường production

---

## 🛠️ Khắc phục lỗi thường gặp

### Lỗi kết nối SQL Server
```
Đảm bảo:
- SQL Server đang chạy
- TCP/IP protocol enabled (SQL Server Configuration Manager)
- Firewall cho phép port 1433
- Authentication mode: SQL Server Authentication
```

### Lỗi CORS
```
Kiểm tra backend đang chạy đúng port 5000
Kiểm tra Vite proxy trong vite.config.ts
```

### Lỗi Excel Export
```
Đảm bảo cột dữ liệu SQL khớp với mapping fieldName (case-insensitive)
```

---

## 📝 License

Nội bộ bệnh viện - Không sử dụng cho mục đích thương mại.
