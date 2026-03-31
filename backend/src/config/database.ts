import Database from 'better-sqlite3';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/hisreports.db');

// =====================
// SQLite ConfigDB
// =====================
let _db: Database.Database | null = null;

export const getDb = (): Database.Database => {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
};

const initSchema = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Users (
      id        TEXT PRIMARY KEY,
      username  TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      fullName  TEXT,
      role      TEXT NOT NULL DEFAULT 'user',
      isActive  INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Reports (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      groupName    TEXT DEFAULT 'Tổng hợp',
      groupIcon    TEXT DEFAULT '📂',
      spName       TEXT NOT NULL,
      description  TEXT,
      templateFile TEXT,
      createdBy    TEXT,
      createdAt    TEXT DEFAULT (datetime('now')),
      updatedAt    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (createdBy) REFERENCES Users(id)
    );

    CREATE TABLE IF NOT EXISTS ReportParameters (
      id           TEXT PRIMARY KEY,
      reportId     TEXT NOT NULL,
      paramName    TEXT NOT NULL,
      paramLabel   TEXT,
      paramType    TEXT DEFAULT 'text',
      defaultValue TEXT,
      isRequired   INTEGER DEFAULT 0,
      displayOrder INTEGER DEFAULT 0,
      options      TEXT,
      FOREIGN KEY (reportId) REFERENCES Reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ReportMappings (
      id           TEXT PRIMARY KEY,
      reportId     TEXT NOT NULL,
      fieldName    TEXT NOT NULL,
      cellAddress  TEXT,
      mappingType  TEXT DEFAULT 'list',
      displayOrder INTEGER DEFAULT 0,
      sheetName    TEXT,
      FOREIGN KEY (reportId) REFERENCES Reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ReportPermissions (
      id        TEXT PRIMARY KEY,
      reportId  TEXT NOT NULL,
      userId    TEXT NOT NULL,
      canView   INTEGER DEFAULT 1,
      canExport INTEGER DEFAULT 1,
      FOREIGN KEY (reportId) REFERENCES Reports(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
      UNIQUE(reportId, userId)
    );

    CREATE TABLE IF NOT EXISTS AuditLogs (
      id        TEXT PRIMARY KEY,
      userId    TEXT,
      action    TEXT,
      target    TEXT,
      ipAddress TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      details   TEXT,
      FOREIGN KEY (userId) REFERENCES Users(id)
    );
  `);

  // Migration: thêm cột sheetName vào ReportMappings nếu chưa có
  try {
    const colInfo = db.prepare("PRAGMA table_info(ReportMappings)").all() as { name: string }[];
    const hasSheetName = colInfo.some(c => c.name === 'sheetName');
    if (!hasSheetName) {
      db.exec('ALTER TABLE ReportMappings ADD COLUMN sheetName TEXT');
    }
  } catch (_) { /* ignore if table doesn't exist yet */ }

  // Migration: thêm cột recordsetIndex vào ReportMappings nếu chưa có
  try {
    const colInfo = db.prepare("PRAGMA table_info(ReportMappings)").all() as { name: string }[];
    const hasRecordsetIndex = colInfo.some(c => c.name === 'recordsetIndex');
    if (!hasRecordsetIndex) {
      db.exec('ALTER TABLE ReportMappings ADD COLUMN recordsetIndex INTEGER DEFAULT 0');
    }
  } catch (_) { /* ignore if table doesn't exist yet */ }

  // Seed users nếu chưa có
  const adminExists = db.prepare('SELECT 1 FROM Users WHERE username = ?').get('admin');
  if (!adminExists) {
    const adminHash = bcrypt.hashSync('Admin@123', 10);
    const userHash = bcrypt.hashSync('User@123', 10);

    db.prepare(
      'INSERT INTO Users (id, username, password, fullName, role, isActive) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), 'admin', adminHash, 'Quản trị viên', 'admin', 1);

    db.prepare(
      'INSERT INTO Users (id, username, password, fullName, role, isActive) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), 'user', userHash, 'Người dùng thường', 'user', 1);
  }
};

// =====================
// SQLite executor - sync, hỗ trợ @name như SQL Server
// SELECT: trả T[], INSERT/UPDATE/DELETE: trả void
// =====================
export const configDb = <T = any>(
  query: string,
  params?: Record<string, any>
): T[] => {
  const db = getDb();
  // Chuyển @name → $name (SQLite named param), giữ nguyên $name đã có
  const sqliteQuery = query.replace(/@(\w+)/g, (_, name) => '$' + name);
  const stmt = db.prepare(sqliteQuery);
  if (params) {
    // better-sqlite3 nhận params với tên không có @ hay $ prefix
    // Query: `@name` hoặc `$name` → param key: `name`
    const sqliteParams: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      const clean = k.replace(/^[@$]/, ''); // bỏ @ hoặc $ ở đầu
      sqliteParams[clean] = v;
    }
    return stmt.all(sqliteParams) as T[];
  }
  return stmt.all() as T[];
};

// INSERT/UPDATE/DELETE executor
export const configExec = (
  query: string,
  params?: Record<string, any>
): Database.RunResult => {
  const db = getDb();
  const sqliteQuery = query.replace(/@(\w+)/g, (_, name) => '$' + name);
  const stmt = db.prepare(sqliteQuery);
  if (params) {
    const sqliteParams: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      const clean = k.replace(/^[@$]/, '');
      sqliteParams[clean] = v;
    }
    return stmt.run(sqliteParams);
  }
  return stmt.run();
};

// =====================
// HospitalDB (MSSQL)
// =====================
const HOSPITAL_DB_CONFIG_FILE = path.join(__dirname, '../../config/hospital_db.json');

export interface HospitalDbConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
}

export const getHospitalDbConfig = (): HospitalDbConfig | null => {
  try {
    if (fs.existsSync(HOSPITAL_DB_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(HOSPITAL_DB_CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading hospital DB config:', e);
  }
  return null;
};

export const saveHospitalDbConfig = (config: HospitalDbConfig): void => {
  const dir = path.dirname(HOSPITAL_DB_CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(HOSPITAL_DB_CONFIG_FILE, JSON.stringify(config, null, 2));
};

export const getHospitalDbPool = async (): Promise<sql.ConnectionPool> => {
  const config = getHospitalDbConfig();
  if (!config) {
    throw new Error('HospitalDB chưa được cấu hình. Vui lòng cấu hình kết nối HospitalDB.');
  }
  try {
    return await sql.connect({
      ...config,
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    });
  } catch (err) {
    console.error('❌ HospitalDB connection failed:', err);
    throw err;
  }
};

export const hospitalDb = async (
  query: string,
  params?: Record<string, any>,
  isProcedure = false
): Promise<sql.IResult<any>> => {
  const pool = await getHospitalDbPool();
  try {
    const request = pool.request();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        // Strip @ prefix for tedious driver compatibility
        const cleanKey = key.startsWith('@') ? key.slice(1) : key;
        request.input(cleanKey, value ?? null);
      }
    }
    return isProcedure ? await request.execute(query) : await request.query(query);
  } finally {
    await pool.close();
  }
};

// Test connections
export const testConnections = async () => {
  const results: Record<string, boolean> = {};
  try {
    getDb().prepare('SELECT 1').get();
    results['ConfigDB'] = true;
  } catch {
    results['ConfigDB'] = false;
  }
  try {
    const hospitalConfig = getHospitalDbConfig();
    if (hospitalConfig) {
      const hospitalPool = await getHospitalDbPool();
      results['HospitalDB'] = true;
      await hospitalPool.close();
    } else {
      results['HospitalDB'] = false;
    }
  } catch {
    results['HospitalDB'] = false;
  }
  return results;
};
