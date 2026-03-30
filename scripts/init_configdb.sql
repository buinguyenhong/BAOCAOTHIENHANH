-- =====================================================
-- HIS Report Server - Database Initialization Script
-- Chạy script này trên SQL Server để tạo ConfigDB
-- =====================================================

USE master;
GO

-- Tạo database nếu chưa tồn tại
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'HISReports')
BEGIN
    CREATE DATABASE HISReports;
END
GO

USE HISReports;
GO

-- =====================================================
-- 1. Bảng Users
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        id          VARCHAR(36) PRIMARY KEY,
        username    VARCHAR(100) UNIQUE NOT NULL,
        password    VARCHAR(255) NOT NULL,
        fullName    NVARCHAR(200),
        role        VARCHAR(20) NOT NULL DEFAULT 'user',
        isActive    BIT DEFAULT 1,
        createdAt   DATETIME DEFAULT GETDATE(),
        updatedAt   DATETIME DEFAULT GETDATE()
    );
END
GO

-- =====================================================
-- 2. Bảng Reports
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Reports')
BEGIN
    CREATE TABLE Reports (
        id              VARCHAR(36) PRIMARY KEY,
        name            NVARCHAR(200) NOT NULL,
        groupName       NVARCHAR(100) DEFAULT N'Tổng hợp',
        groupIcon       VARCHAR(20) DEFAULT '📂',
        spName          NVARCHAR(200) NOT NULL,
        description     NVARCHAR(500),
        templateFile    VARCHAR(500),
        createdBy       VARCHAR(36),
        createdAt       DATETIME DEFAULT GETDATE(),
        updatedAt       DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (createdBy) REFERENCES Users(id)
    );
END
GO

-- =====================================================
-- 3. Bảng ReportParameters
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReportParameters')
BEGIN
    CREATE TABLE ReportParameters (
        id            VARCHAR(36) PRIMARY KEY,
        reportId      VARCHAR(36) NOT NULL,
        paramName     VARCHAR(100) NOT NULL,
        paramLabel    NVARCHAR(200),
        paramType     VARCHAR(20) DEFAULT 'text',
        defaultValue  NVARCHAR(200),
        isRequired    BIT DEFAULT 0,
        displayOrder  INT DEFAULT 0,
        options       NVARCHAR(MAX),
        FOREIGN KEY (reportId) REFERENCES Reports(id) ON DELETE CASCADE
    );
END
GO

-- =====================================================
-- 4. Bảng ReportMappings
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReportMappings')
BEGIN
    CREATE TABLE ReportMappings (
        id            VARCHAR(36) PRIMARY KEY,
        reportId      VARCHAR(36) NOT NULL,
        fieldName     VARCHAR(200) NOT NULL,
        cellAddress   VARCHAR(20),
        mappingType   VARCHAR(20) DEFAULT 'list',
        displayOrder  INT DEFAULT 0,
        sheetName     VARCHAR(100),
        FOREIGN KEY (reportId) REFERENCES Reports(id) ON DELETE CASCADE
    );
END
GO

-- Thêm cột sheetName nếu bảng đã tồn tại (migration)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ReportMappings') AND name = 'sheetName')
BEGIN
    ALTER TABLE ReportMappings ADD sheetName VARCHAR(100);
END
GO

-- =====================================================
-- 5. Bảng ReportPermissions
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReportPermissions')
BEGIN
    CREATE TABLE ReportPermissions (
        id          VARCHAR(36) PRIMARY KEY,
        reportId    VARCHAR(36) NOT NULL,
        userId      VARCHAR(36) NOT NULL,
        canView     BIT DEFAULT 1,
        canExport   BIT DEFAULT 1,
        FOREIGN KEY (reportId) REFERENCES Reports(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
        UNIQUE(reportId, userId)
    );
END
GO

-- =====================================================
-- 6. Bảng AuditLogs
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLogs')
BEGIN
    CREATE TABLE AuditLogs (
        id          VARCHAR(36) PRIMARY KEY,
        userId      VARCHAR(36),
        action      VARCHAR(50),
        target      NVARCHAR(500),
        ipAddress   VARCHAR(50),
        timestamp   DATETIME DEFAULT GETDATE(),
        details     NVARCHAR(MAX),
        FOREIGN KEY (userId) REFERENCES Users(id)
    );
END
GO

-- =====================================================
-- 7. Seed: Admin User
-- Password: Admin@123 (bcrypt hash of "Admin@123")
-- =====================================================
IF NOT EXISTS (SELECT * FROM Users WHERE username = 'admin')
BEGIN
    INSERT INTO Users (id, username, password, fullName, role, isActive)
    VALUES (
        LOWER(CONVERT(VARCHAR(36), NEWID())),
        'admin',
        '$2a$10$QszXNrAaXKkmOaImloF3TO.wnvJiIrIT/RKkGFfG1A3TbBH7SbXj.',
        N'Quản trị viên',
        'admin',
        1
    );
END
GO

-- =====================================================
-- 8. Seed: Test User
-- Password: User@123 (bcrypt hash of "User@123")
-- =====================================================
IF NOT EXISTS (SELECT * FROM Users WHERE username = 'user')
BEGIN
    INSERT INTO Users (id, username, password, fullName, role, isActive)
    VALUES (
        LOWER(CONVERT(VARCHAR(36), NEWID())),
        'user',
        '$2a$10$d6nBHBF/usRBtFL2LwtaQOGob/euTki/WTP/6G/OBXGm8kfOI12by',
        N'Người dùng thường',
        'user',
        1
    );
END
GO

-- =====================================================
-- 9. Seed: Sample Report (tham khảo - xóa sau khi test)
-- =====================================================
DECLARE @adminId VARCHAR(36);
SELECT @adminId = id FROM Users WHERE username = 'admin';

IF NOT EXISTS (SELECT * FROM Reports WHERE spName = 'sp_Rpt_DanhSachBenhNhan')
BEGIN
    DECLARE @reportId VARCHAR(36) = LOWER(CONVERT(VARCHAR(36), NEWID()));

    INSERT INTO Reports (id, name, groupName, groupIcon, spName, description, createdBy)
    VALUES (
        @reportId,
        N'Danh sách Bệnh nhân',
        N'Bệnh nhân',
        '🏥',
        'sp_Rpt_DanhSachBenhNhan',
        N'Danh sách bệnh nhân theo khoa và ngày',
        @adminId
    );

    -- Thêm parameters mặc định
    INSERT INTO ReportParameters (id, reportId, paramName, paramLabel, paramType, defaultValue, isRequired, displayOrder)
    VALUES
        (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, '@TuNgay', N'Từ ngày', 'date', '', 1, 1),
        (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, '@DenNgay', N'Đến ngày', 'date', '', 1, 2),
        (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, '@MaKhoa', N'Mã Khoa', 'text', '', 0, 3);

    -- Thêm mappings mẫu (sẽ được cập nhật khi thiết kế)
    INSERT INTO ReportMappings (id, reportId, fieldName, cellAddress, mappingType, displayOrder)
    VALUES
        (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, 'MaBN', 'A10', 'list', 1),
        (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, 'HoTen', 'B10', 'list', 2),
        (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, 'NgaySinh', 'C10', 'list', 3),
        (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, 'GioiTinh', 'D10', 'list', 4),
        (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, 'DiaChi', 'E10', 'list', 5);

    -- Gán quyền cho admin
    INSERT INTO ReportPermissions (id, reportId, userId, canView, canExport)
    VALUES (LOWER(CONVERT(VARCHAR(36), NEWID())), @reportId, @adminId, 1, 1);
END
GO

PRINT '✅ HISReports database initialized successfully!';
PRINT '📋 Default admin credentials: admin / Admin@123';
PRINT '📋 Default user credentials: user / User@123';
GO
