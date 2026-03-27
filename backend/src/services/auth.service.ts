import { configDb } from '../config/database.js';
import { User, LoginDto, CreateUserDto, UpdateUserDto } from '../models/types.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { v4 as uuidv4 } from 'uuid';

export class AuthService {
  // Tìm user theo username
  async findByUsername(username: string): Promise<User | null> {
    const users = await configDb<User>(
      'SELECT * FROM Users WHERE username = @username',
      { username }
    );
    return users[0] || null;
  }

  // Tìm user theo ID
  async findById(id: string): Promise<User | null> {
    const users = await configDb<User>(
      'SELECT * FROM Users WHERE id = @id',
      { id }
    );
    return users[0] || null;
  }

  // Đăng nhập
  async login(dto: LoginDto): Promise<User | null> {
    const user = await this.findByUsername(dto.username);
    if (!user) return null;
    if (!user.isActive) return null;

    const isMatch = await comparePassword(dto.password, user.password || '');
    if (!isMatch) return null;

    return user;
  }

  // Tạo user mới
  async createUser(dto: CreateUserDto): Promise<User> {
    const id = uuidv4();
    const hashed = await hashPassword(dto.password);

    await configDb(
      `INSERT INTO Users (id, username, password, fullName, role, isActive)
       VALUES (@id, @username, @password, @fullName, @role, 1)`,
      {
        id,
        username: dto.username,
        password: hashed,
        fullName: dto.fullName || null,
        role: dto.role || 'user',
      }
    );

    const user = await this.findById(id);
    return user!;
  }

  // Cập nhật user
  async updateUser(id: string, dto: UpdateUserDto): Promise<User | null> {
    const updates: string[] = [];
    const params: Record<string, any> = { id };

    if (dto.fullName !== undefined) {
      updates.push('fullName = @fullName');
      params.fullName = dto.fullName;
    }
    if (dto.role !== undefined) {
      updates.push('role = @role');
      params.role = dto.role;
    }
    if (dto.isActive !== undefined) {
      updates.push('isActive = @isActive');
      params.isActive = dto.isActive ? 1 : 0;
    }

    if (updates.length === 0) return this.findById(id);

    updates.push('updatedAt = GETDATE()');

    await configDb(
      `UPDATE Users SET ${updates.join(', ')} WHERE id = @id`,
      params
    );

    return this.findById(id);
  }

  // Đổi mật khẩu
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    const isMatch = await comparePassword(oldPassword, user.password || '');
    if (!isMatch) return false;

    const hashed = await hashPassword(newPassword);
    await configDb(
      'UPDATE Users SET password = @password, updatedAt = GETDATE() WHERE id = @id',
      { id: userId, password: hashed }
    );

    return true;
  }

  // Reset mật khẩu (admin)
  async resetPassword(userId: string, newPassword: string): Promise<boolean> {
    const hashed = await hashPassword(newPassword);
    await configDb(
      'UPDATE Users SET password = @password, updatedAt = GETDATE() WHERE id = @id',
      { id: userId, password: hashed }
    );
    return true;
  }

  // Lấy tất cả users
  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    const users = await configDb<Omit<User, 'password'>>(
      'SELECT id, username, fullName, role, isActive, createdAt, updatedAt FROM Users ORDER BY createdAt DESC'
    );
    return users;
  }

  // Xóa user
  async deleteUser(id: string): Promise<boolean> {
    await configDb('DELETE FROM Users WHERE id = @id', { id });
    return true;
  }
}

export const authService = new AuthService();
