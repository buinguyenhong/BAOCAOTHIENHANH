import { Router, Request, Response } from 'express';
import { hospitalService } from '../services/hospital.service.js';
import {
  getHospitalDbConfig,
  saveHospitalDbConfig,
  testConnections,
} from '../config/database.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { auditService } from '../services/audit.service.js';

const router = Router();

// GET /api/system/stored-procedures - Danh sách SP
router.get(
  '/stored-procedures',
  authMiddleware,
  async (_req: Request, res: Response) => {
    try {
      const sps = await hospitalService.listStoredProcedures();
      res.json({ success: true, data: sps });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/system/sp-metadata/:spName - Metadata cột + params của SP
router.get(
  '/sp-metadata/:spName',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { spName } = req.params;
      const [columns, parameters] = await Promise.all([
        hospitalService.getSPColumnMetadata(spName),
        hospitalService.getSPParameterMetadata(spName),
      ]);

      res.json({
        success: true,
        data: { columns, parameters },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/system/connection-status - Trạng thái kết nối
router.get(
  '/connection-status',
  authMiddleware,
  async (_req: Request, res: Response) => {
    try {
      const results = await testConnections();
      const hospitalConfig = getHospitalDbConfig();
      res.json({
        success: true,
        data: {
          configDB: results['ConfigDB'],
          hospitalDB: results['HospitalDB'],
          hospitalConfigured: !!hospitalConfig,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/system/setup-connection - Cấu hình HospitalDB (Admin only)
router.post(
  '/setup-connection',
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { server, database, user, password } = req.body;

      if (!server || !database || !user) {
        return res.status(400).json({
          success: false,
          error: 'Vui lòng nhập đầy đủ thông tin server, database, user',
        });
      }

      // Test connection trước khi lưu
      const testConfig = {
        server,
        database,
        user,
        password: password || '',
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      };

      // Lưu config trước (sẽ test connection sau)
      saveHospitalDbConfig(testConfig);

      // Test thực tế
      try {
        const { getHospitalDbPool } = await import('../config/database.js');
        const pool = await getHospitalDbPool();
        await pool.close();
      } catch (connErr: any) {
        return res.status(400).json({
          success: false,
          error: `Kết nối thất bại: ${connErr.message}`,
        });
      }

      await auditService.log(
        'UPDATE_CONFIG',
        req.user!.userId,
        `HospitalDB: ${server}/${database}`,
        req.ip,
        'Cấu hình kết nối HospitalDB'
      );

      res.json({ success: true, message: 'Cấu hình HospitalDB thành công' });
    } catch (err: any) {
      console.error('Setup connection error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
