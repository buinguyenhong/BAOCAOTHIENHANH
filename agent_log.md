# Nhật ký Chỉnh sửa của Agent (Agent Modification Log)

Tài liệu này lưu trữ toàn bộ các thay đổi được thực hiện bởi các Agent AI qua từng đợt chỉnh sửa trong dự án **BAOCAOTHIENHANH**.

---

## 📌 Quy tắc Cập nhật Nhật ký (Bắt buộc đối với Agent)
* Bất cứ khi nào Agent thực hiện thay đổi mã nguồn, cấu hình hệ thống hoặc cơ sở dữ liệu, Agent **BẮT BUỘC** phải thêm một dòng nhật ký mới lên trên cùng của danh sách thay đổi (mục **Lịch sử thay đổi**).
* Định dạng dòng ghi nhận thay đổi bao gồm:
  * **Thời gian**: Ngày giờ thực hiện chỉnh sửa (theo giờ địa phương của hệ thống, ví dụ: `YYYY-MM-DD HH:mm`).
  * **Tác vụ**: Tóm tắt ngắn gọn mục tiêu chỉnh sửa.
  * **Chi tiết thay đổi**:
    * Các file được tạo mới/sửa đổi/xóa bỏ kèm theo link liên kết cục bộ dạng `file:///`.
    * Lý do chỉnh sửa và giải pháp đã thực hiện.
  * **Trạng thái**: Hoàn thành / Đang kiểm thử / Đang chờ phản hồi.

---

## 📜 Lịch sử thay đổi

### [2026-06-16 11:20] Tối ưu hóa tải trang Offline (Mạng LAN không Internet)
* **Tác vụ**: Sửa lỗi trang tải lần đầu chậm do thiết bị tìm kiếm tài nguyên ngoài internet (Google Fonts) trong môi trường mạng LAN bị ngắt kết nối ngoài.
* **Chi tiết thay đổi**:
  * **Loại bỏ liên kết font ngoài**: Loại bỏ khai báo `@import url('https://fonts.googleapis.com/css2?...')` ở đầu file [index.css](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/frontend/src/styles/index.css).
  * **Thay thế Font-family**: Cập nhật `font-family` sang sử dụng Font Stack hệ thống bản địa (`system-ui, -apple-system, Segoe UI, Roboto,...`) giúp trang tải ngay lập tức không phụ thuộc internet và giữ nguyên giao diện hiện đại.
  * **Rebuild**: Đã build lại tài nguyên tĩnh của frontend để backend serve bản cập nhật này.
* **Trạng thái**: Đã hoàn thành.

---

### [2026-06-16 08:42] Tối ưu hóa Kết nối Database, Giải quyết N+1 Queries & Thêm Tiến trình Báo cáo
* **Tác vụ**: Giải quyết vấn đề trang tải lần đầu chậm và thiếu hiển thị tiến trình thực thi Stored Procedure.
* **Chi tiết thay đổi**:
  * **Tối ưu Connection Pool**: Sửa đổi [database.ts](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/backend/src/config/database.ts) để lưu giữ kết nối MSSQL toàn cục (`_hospitalPool`), tránh việc kết nối và đóng kết nối liên tục trên mỗi câu truy vấn.
  * **Giải quyết N+1 Queries**: Sửa đổi [auth.service.ts](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/backend/src/services/auth.service.ts) để nạp toàn bộ parameter và mapping của tất cả các báo cáo bằng 2 câu lệnh truy vấn SQLite duy nhất (thay vì lặp $2N+1$ lần), nhóm dữ liệu trong bộ nhớ thông qua `Map`.
  * **Thêm Tiến trình Báo cáo (Frontend)**: 
    * Tạo mới component [ReportLoadingProgress.tsx](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/frontend/src/components/ReportLoadingProgress.tsx) hiển thị vòng tròn xoay hoạt họa kèm theo bộ đếm thời gian thực thi (giây) và danh sách các bước tiến trình động.
    * Tích hợp vào file [Dashboard.tsx](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/frontend/src/pages/Dashboard.tsx) để hiển thị trong thời gian chờ Stored Procedure trả kết quả.
* **Trạng thái**: Đã hoàn thành.

---

### [2026-06-16 08:35] Thiết lập Nhật ký Agent và Luật Cập nhật
* **Tác vụ**: Khởi tạo file nhật ký và thiết lập quy trình làm việc chuẩn cho Agent AI.
* **Chi tiết thay đổi**:
  * Tạo mới file [agent_log.md](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/agent_log.md) để lưu trữ lịch sử chỉnh sửa.
  * Tạo mới file quy tắc cấu hình [.clauderules](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/.clauderules) và [.cursorrules](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/.cursorrules) để ép buộc các Agent AI luôn tuân thủ việc cập nhật file log này sau mỗi lần chỉnh sửa.
* **Trạng thái**: Đã hoàn thành.

---

## 🔍 Phân tích Điểm mạnh, Điểm yếu & Đề xuất Cải tiến dự án

### 1. Điểm mạnh (Strengths)
* **Deterministic Excel Export**: Việc chuyển sang sử dụng `mapping.valueType` thay cho heuristics là bước tiến lớn, loại bỏ hoàn toàn các bug định dạng Excel kinh điển (như nhận nhầm số ID thành ngày tháng).
* **Cấu hình tham số và Serialization mạnh mẽ**: Luồng chuẩn hóa (`normalizeInputValue` $\rightarrow$ `serializeByParamType` $\rightarrow$ `serializeByValueMode`) thiết kế mạch lạc, xử lý tốt cả Single-value lẫn Multi-value (dạng CSV hoặc JSON) của Stored Procedures.
* **Xử lý List Block tối ưu**: Việc nhóm các cột danh sách thành List Block và thực hiện `spliceRows` từ dưới lên (DESC row index) giúp giữ vững cấu trúc dòng của Excel template mà không gây lệch vị trí dữ liệu.
* **Migration database tự động**: Code khởi tạo SQLite có cơ chế migration an toàn, tự động thêm cột mới mà không phá vỡ dữ liệu hay cấu trúc cũ (backward compatibility tốt).
* **Bảo mật và Audit Log đầy đủ**: Sử dụng bcrypt, JWT và có bảng ghi nhận lịch sử hoạt động chi tiết giúp hệ thống sẵn sàng hoạt động trong mạng nội bộ bệnh viện.

### 2. Điểm yếu (Weaknesses) & Nút thắt hiệu năng (Bottlenecks)
* **Kết nối MSSQL (HospitalDB) kém hiệu quả**:
  * *Chi tiết*: Trong [database.ts](file:///d:/Project/BAOCAOTHIENHANH/BAOCAOTHIENHANH/backend/src/config/database.ts), hàm `hospitalDb` mở connection pool mới qua `getHospitalDbPool` cho mỗi câu truy vấn và đóng ngay lập tức bằng `pool.close()` ở block `finally`.
  * *Hậu quả*: Mỗi một request chạy báo cáo hoặc lấy tùy chọn động sẽ phải chịu thêm độ trễ TCP/TLS handshake cực lớn với SQL Server, làm cạn kiệt tài nguyên kết nối và giảm hiệu năng nghiêm trọng khi có nhiều người dùng đồng thời.
* **Lỗi lệch dòng khi Sắp xếp List Block đa tầng (Multi-List Block Splicing Shift)**:
  * *Chi tiết*: Khi template Excel có từ 2 danh sách trở lên trên cùng một Sheet nằm cách nhau (ví dụ: Block 1 ở dòng 20, Block 2 ở dòng 10):
    1. Logic sắp xếp DESC sẽ xử lý Block 1 (dòng 20) trước $\rightarrow$ Ghi dữ liệu và splice chèn thêm các dòng trống.
    2. Sau đó, xử lý Block 2 (dòng 10) $\rightarrow$ Ghi dữ liệu và splice chèn thêm dòng trống.
    3. Việc chèn dòng ở Block 2 (dòng 10) sẽ đẩy toàn bộ dữ liệu ở các dòng phía dưới xuống (kể cả Block 1 giờ đã bị dịch xuống ví dụ dòng 29). Tuy nhiên, các cột tiếp theo của Block 1 vẫn bị ghi đè dựa trên vị trí tĩnh ban đầu (`rowStart = 20`).
  * *Hậu quả*: Dữ liệu của các cột sau ở Block 1 sẽ bị ghi lệch dòng so với cột đầu tiên, làm hỏng hoàn toàn hiển thị của bảng dữ liệu.
* **Thiếu cơ chế Giao dịch (Transactions) cho SQLite**:
  * *Chi tiết*: Các hàm CRUD của report (như lưu đồng thời metadata, parameters, mappings) thực hiện nhiều câu lệnh SQLite liên tiếp mà không nằm trong một block Transaction (`BEGIN TRANSACTION`).
  * *Hậu quả*: Nếu một câu lệnh chèn giữa chừng bị lỗi (ví dụ trùng khóa), database sẽ rơi vào trạng thái không nhất quán hoặc lỗi dữ liệu một nửa.
* **Thiếu kiểm tra tính hợp lệ của tham số (Parameter Validation)**:
  * *Chi tiết*: Backend nhận trực tiếp tham số đầu vào và truyền vào Stored Procedure mà không kiểm tra độ dài, kiểu dữ liệu hay chống SQL injection cơ bản ở mức API parameter.

### 3. Đề xuất Chỉnh sửa (Proposed Modifications)
1. **Tối ưu Connection Pooling**: Refactor `database.ts` để tái sử dụng một connection pool MSSQL duy nhất cho toàn ứng dụng thay vì đóng/mở liên tục.
2. **Cập nhật dịch chuyển dòng trong ListBlockManager**: Khi một block thực hiện `spliceRows`, nó cần thông báo cho tất cả các block khác nằm phía dưới nó trên cùng một Sheet dịch chuyển `rowStart` và `templateRow` tương ứng để tránh ghi lệch.
3. **Thêm SQLite Transaction**: Bọc các tác vụ ghi nhiều bảng (Parameters, Mappings) vào SQLite transactions.
4. **Tăng cường Parameter Validation**: Sử dụng middleware hoặc thư viện kiểm tra dữ liệu đầu vào khớp với cấu hình `ReportParameter`.
