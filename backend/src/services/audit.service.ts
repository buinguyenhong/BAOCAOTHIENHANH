import { configDb, configExec } from '../config/database.js';
import { AuditLog, AuditAction } from '../models/types.js';
import { v4 as uuidv4 } from 'uuid';

export class AuditService {
  log(
    action: AuditAction,
    userId: string | null,
    target: string | null,
    ipAddress: string | null,
    details: string | null = null
  ): void {
    try {
      configExec(
        `INSERT INTO AuditLogs (id, userId, action, target, ipAddress, details)
         VALUES ($id, $userId, $action, $target, $ipAddress, $details)`,
        {
          id: uuidv4(),
          userId,
          action,
          target,
          ipAddress,
          details,
        }
      );
    } catch (err) {
      console.error('Audit log error:', err);
    }
  }

  getLogs(limit = 100): AuditLog[] {
    return configDb<AuditLog>(
      `SELECT * FROM AuditLogs ORDER BY timestamp DESC LIMIT $limit`,
      { limit }
    );
  }

  getLogsByUser(userId: string, limit = 50): AuditLog[] {
    return configDb<AuditLog>(
      `SELECT * FROM AuditLogs WHERE userId = $userId ORDER BY timestamp DESC LIMIT $limit`,
      { userId, limit }
    );
  }
}

export const auditService = new AuditService();
