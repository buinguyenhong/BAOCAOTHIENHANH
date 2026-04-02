import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.routes.js';
import reportRoutes from './routes/report.routes.js';
import userRoutes from './routes/user.routes.js';
import systemRoutes from './routes/system.routes.js';
import { getDb } from './config/database.js';

/**
 * Lấy địa chỉ IP LAN thực của máy chủ.
 * Duyệt qua tất cả network interfaces, ưu tiên IPv4 bắt đầu bằng 192.168.
 */
function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    for (const iface of nets) {
      // Ưu tiên IPv4, bỏ qua internal (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        // Ưu tiên subnet 192.168.x.x (mạng LAN thường)
        if (iface.address.startsWith('192.168.')) return iface.address;
        // Fallback: lấy IPv4 external đầu tiên tìm được
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LAN_IP = getLocalIp();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Initialize SQLite database (tạo bảng + seed users)
getDb();
console.log('✅ ConfigDB (SQLite) initialized');
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // Lắng nghe trên tất cả interface (để LAN truy cập)

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Cho phép tất cả origins trong LAN (hoặc localhost)
    if (!origin || origin.includes('localhost') || origin.includes('192.168') || origin.includes('baocaothienhanh')) {
      callback(null, true);
    } else {
      callback(null, true); // Cho phép tất cả vì deploy LAN
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files (templates)
app.use('/templates', express.static(path.join(__dirname, '../templates')));

// Serve frontend build (sau khi build frontend)
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// SPA fallback - redirect all non-API routes to index.html
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', reportRoutes);
app.use('/api', userRoutes);
app.use('/api/system', systemRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'HIS Report Server is running', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(Number(PORT), HOST, () => {
  console.log(`\n🚀 HIS Report Server`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   LAN:   http://${HOST === '0.0.0.0' ? LAN_IP : HOST}:${PORT}`);
  console.log(`   API:   http://localhost:${PORT}/api`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
