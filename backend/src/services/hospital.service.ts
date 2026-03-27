import { hospitalDb } from '../config/database.js';
import { SPInfo, SPColumnMetadata, SPParameterMetadata, QueryResult } from '../models/types.js';

export class HospitalService {
  // Lấy danh sách Stored Procedures từ HospitalDB
  async listStoredProcedures(): Promise<SPInfo[]> {
    const result = await hospitalDb(`
      SELECT name
      FROM sys.procedures
      WHERE is_ms_shipped = 0
      ORDER BY name
    `);
    return (result.recordset || []).map((r: any) => ({ name: r.name }));
  }

  // Lấy metadata cột trả về của SP
  async getSPColumnMetadata(spName: string): Promise<SPColumnMetadata[]> {
    try {
      const result = await hospitalDb(`
        SELECT
          name,
          system_type_name AS type,
          max_length AS maxLength,
          precision,
          scale,
          is_nullable AS isNullable
        FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(@spName), 0)
        WHERE name IS NOT NULL
      `, { spName });

      return (result.recordset || []).map((r: any) => ({
        name: r.name,
        type: r.type,
        maxLength: r.maxLength,
        precision: r.precision,
        scale: r.scale,
        isNullable: r.isNullable,
      }));
    } catch (err: any) {
      console.error('Error getting SP column metadata:', err);
      throw new Error(`Không thể lấy metadata của ${spName}: ${err.message}`);
    }
  }

  // Lấy metadata parameters của SP
  async getSPParameterMetadata(spName: string): Promise<SPParameterMetadata[]> {
    try {
      const result = await hospitalDb(`
        SELECT
          p.name,
          t.name AS type,
          p.max_length AS maxLength,
          p.precision,
          p.scale,
          p.is_nullable AS isNullable,
          CASE WHEN dc.default_object_id IS NOT NULL THEN 1 ELSE 0 END AS hasDefaultValue
        FROM sys.parameters p
        INNER JOIN sys.types t ON p.user_type_id = t.user_type_id
        WHERE p.object_id = OBJECT_ID(@spName) AND p.parameter_id > 0
        ORDER BY p.parameter_id
      `, { spName });

      return (result.recordset || []).map((r: any) => ({
        name: r.name,
        type: r.type,
        maxLength: r.maxLength,
        precision: r.precision,
        scale: r.scale,
        isNullable: r.isNullable,
        hasDefaultValue: !!r.hasDefaultValue,
      }));
    } catch (err: any) {
      console.error('Error getting SP parameter metadata:', err);
      // Trả về rỗng nếu không lấy được (SP có thể không có params)
      return [];
    }
  }

  // Thực thi Stored Procedure với params động
  async executeStoredProcedure(
    spName: string,
    params: Record<string, any>
  ): Promise<QueryResult> {
    try {
      // Build params object - loại bỏ undefined/null
      const cleanParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          cleanParams[key] = value;
        }
      }

      const result = await hospitalDb(spName, cleanParams, true);
      const recordset = result.recordset || [];

      if (recordset.length === 0) {
        return { columns: [], rows: [] };
      }

      const columns = Object.keys(recordset[0]);

      return {
        columns,
        rows: recordset,
      };
    } catch (err: any) {
      console.error('Error executing SP:', err);
      throw new Error(`Lỗi thực thi ${spName}: ${err.message}`);
    }
  }
}

export const hospitalService = new HospitalService();
