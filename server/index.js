import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { initDb } from './db.js';
import { createRoutes } from './routes.js';
import { TOKEN_COOKIE } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'id-channel-dev-secret-change-me';
const isProd = process.env.NODE_ENV === 'production';

if (isProd && JWT_SECRET === 'id-channel-dev-secret-change-me') {
  console.warn('WARNING: Set a strong JWT_SECRET environment variable in production.');
}

await initDb();

const app = express();
// Render / reverse proxies terminate TLS — needed for secure cookies
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: isProd ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  },
  // Helpful on free hosts that sleep / restart
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(
  cors({
    origin: isProd ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'id-channel' });
});

app.use('/api', createRoutes(io));

if (isProd) {
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

io.use((socket, next) => {
  try {
    const cookieHeader = socket.request.headers.cookie || '';
    const match = cookieHeader.match(new RegExp(`${TOKEN_COOKIE}=([^;]+)`));
    const token = match?.[1] || socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    const payload = jwt.verify(decodeURIComponent(token), JWT_SECRET);
    socket.userId = payload.uid;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);
  socket.on('disconnect', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ID Channel listening on 0.0.0.0:${PORT} (${isProd ? 'production' : 'dev'})`);
});
