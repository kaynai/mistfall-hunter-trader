// 会话管理（基于 token，内存 + 持久化到文件）
const crypto = require('crypto');
const db = require('./db');

let sessions = {};
// 持久化会话，服务重启后仍保持登录
try {
  const fs = require('fs');
  const path = require('path');
  const p = path.join(db.DATA_DIR, 'sessions.json');
  if (fs.existsSync(p)) sessions = JSON.parse(fs.readFileSync(p, 'utf8'));
} catch (e) { /* ignore */ }

function persist() {
  try {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(db.DATA_DIR, 'sessions.json'), JSON.stringify(sessions), 'utf8');
  } catch (e) { /* ignore */ }
}

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

function createToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions[token] = { userId, createdAt: Date.now() };
  persist();
  return token;
}

function getUserFromToken(token) {
  if (!token) return null;
  const s = sessions[token];
  if (!s) return null;
  if (Date.now() - s.createdAt > TOKEN_TTL) {
    delete sessions[token];
    persist();
    return null;
  }
  return db.findUserById(s.userId) || null;
}

function destroyToken(token) {
  if (token && sessions[token]) {
    delete sessions[token];
    persist();
  }
}

// Express 中间件：从 Authorization: Bearer <token> 解析用户
function auth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
  req.user = getUserFromToken(token) || null;
  next();
}

// 要求必须登录
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  next();
}

// 要求管理员
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

module.exports = { createToken, getUserFromToken, destroyToken, auth, requireAuth, requireAdmin };
