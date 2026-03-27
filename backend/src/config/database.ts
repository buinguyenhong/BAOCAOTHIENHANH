import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =====================
// ConfigDB connection
// =====================
export const getConfigDbPool = async (): Promise<sql.ConnectionPool> => {
  const config: sql.config = {
    server: process.env.CONFIGDB_SERVER || 'localhost',
    database: process.env.CONFIGDB_DATABASE || 'HISReports',
    user: process.env.CONFIGDB_USER || 'sa',
    password: process.env.CONFIGDB_PASSWORD || '',
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  try {
    const pool = await sql.connect(config);
    return pool;
  } catch (err) {
    console.error('❌ ConfigDB connection failed:', err);
    throw err;
  }
};

// =====================
// HospitalDB connection
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
    const pool = await sql.connect({
      ...config,
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    });
    return pool;
  } catch (err) {
    console.error('❌ HospitalDB connection failed:', err);
    throw err;
  }
};

// =====================
// Generic query executor (ConfigDB)
// =====================
export const configDb = async <T = any>(
  query: string,
  params?: Record<string, any>
): Promise<T[]> => {
  const pool = await getConfigDbPool();
  try {
    const request = pool.request();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
    }
    const result = await request.query(query);
    return result.recordset as T[];
  } finally {
    await pool.close();
  }
};

// =====================
// Generic execute (HospitalDB)
// =====================
export const hospitalDb = async (
  query: string,
  params?: Record<string, any>,
  isProcedure = false
): Promise<sql.IRecordSet<any>> => {
  const pool = await getHospitalDbPool();
  try {
    const request = pool.request();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value ?? null);
      }
    }
    if (isProcedure) {
      return await request.execute(query);
    }
    return await request.query(query);
  } finally {
    await pool.close();
  }
};

// Test both connections
export const testConnections = async () => {
  const results: Record<string, boolean> = {};

  try {
    const configPool = await getConfigDbPool();
    results['ConfigDB'] = true;
    await configPool.close();
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
