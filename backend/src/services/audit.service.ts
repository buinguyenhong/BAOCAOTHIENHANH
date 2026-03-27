import { configDb } from '../config/database.js';
import { AuditLog, AuditAction } from '../models/types.js';
import { v4 as uuidv4 } from 'uuid';

export class AuditService {
  async log(
    action: AuditAction,
    userId: string | null,
    target: string | null,
    ipAddress: string | null,
    details: string | null = null
  ): Promise<void> {
    try {
      await configDb(
        `INSERT INTO AuditLogs (id, userId, action, target, ipAddress, details)
         VALUES (@id, @userId, @action, @target, @ipAddress, @details)`,
        {
          id: uuidv4(),
          userId: userId || null,
          action,
          target: target || null,
          ipAddress: ipAddress || null,
          details: details || null,
        }
      );
    } catch (err) {
      // Log lỗi audit không nên crash app
      console.error('Audit log error:', err);
    }
  }

  async getLogs(limit = 100): Promise<AuditLog[]> {
    return configDb<AuditLog>(
      `SELECT TOP ${limit} * FROM AuditLogs ORDER BY timestamp DESC`
    );
  }

  async getLogsByUser(userId: string, limit = 50): Promise<AuditLog[]> {
    return configDb<AuditLog>(
      `SELECT TOP ${limit} * FROM AuditLogs WHERE userId = @userId ORDER BY timestamp DESC`,
      { userId }
    );
  }
}

export const auditService = new AuditService();
