// 本地文件存储服务
// 使用 JSON 文件持久化：用户、卖家挂单、订单、支付配置
// 无需数据库，服务重启后数据不丢失
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', config.dataDir || 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  users: 'users.json',
  listings: 'listings.json', // 动态挂单（卖家发布）
  orders: 'orders.json',
  config: 'siteconfig.json', // 后台配置（支付密钥等）
};

function filePath(name) {
  return path.join(DATA_DIR, FILES[name]);
}

function read(name, fallback) {
  try {
    const p = filePath(name);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn('[db] 读取', name, '失败:', e.message);
    return fallback;
  }
}

function write(name, data) {
  try {
    const p = filePath(name);
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, p);
    return true;
  } catch (e) {
    console.error('[db] 写入', name, '失败:', e.message);
    return false;
  }
}

// ---- 用户 ----
function getUsers() { return read('users', []); }
function saveUsers(users) { return write('users', users); }
function findUserByEmail(email) {
  return getUsers().find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
}
function findUserById(id) { return getUsers().find((u) => u.id === id); }

// 密码哈希（salt + sha256）
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.createHash('sha256').update(salt + pw).digest('hex');
  return { salt, hash };
}
function verifyPassword(user, pw) {
  const h = crypto.createHash('sha256').update(user.salt + pw).digest('hex');
  return h === user.hash;
}

function createUser({ email, password, name, role = 'buyer' }) {
  const users = getUsers();
  const { salt, hash } = hashPassword(password);
  const user = {
    id: 'U' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    email: String(email).toLowerCase(),
    name: name || String(email).split('@')[0],
    role, // buyer 买家 | seller 卖家 | admin 管理员
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return sanitize(user);
}

// 返回给前端的用户信息（去掉敏感字段）
function sanitize(user) {
  if (!user) return null;
  const { salt, hash, ...safe } = user;
  return safe;
}

// ---- 卖家动态挂单 ----
function getListings() { return read('listings', []); }
function saveListings(listings) { return write('listings', listings); }

function makeListingId() {
  return 'L' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

function createListing(data) {
  const listings = getListings();
  const listing = {
    id: makeListingId(),
    sellerId: data.sellerId,
    sellerName: data.sellerName,
    name: data.name,
    category: data.category || '其他',
    description: data.description || '',
    priceCny: Math.max(0.01, Number(data.priceCny) || 0),
    stock: Math.max(0, Math.floor(Number(data.stock) || 0)),
    status: data.status === 'active' ? 'active' : 'pending', // active 上架 | pending 待审核 | inactive 下架
    featured: !!data.featured,
    sellerListing: true, // 标识为卖家自定义挂单
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  listings.push(listing);
  saveListings(listings);
  return listing;
}

function updateListing(id, patch, userId, isAdmin = false) {
  const listings = getListings();
  const idx = listings.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const l = listings[idx];
  // 权限：管理员或该挂单的卖家本人
  if (!isAdmin && l.sellerId !== userId) return { error: '无权操作该挂单' };
  if (patch.priceCny !== undefined) l.priceCny = Math.max(0.01, Number(patch.priceCny) || 0);
  if (patch.name !== undefined) l.name = patch.name;
  if (patch.category !== undefined) l.category = patch.category;
  if (patch.description !== undefined) l.description = patch.description;
  if (patch.stock !== undefined) l.stock = Math.max(0, Math.floor(Number(patch.stock) || 0));
  if (patch.status !== undefined) l.status = patch.status;
  l.updatedAt = new Date().toISOString();
  saveListings(listings);
  return l;
}

// 上架/下架（卖家自动控制）
function setListingStatus(id, status, userId, isAdmin = false) {
  const listings = getListings();
  const l = listings.find((x) => x.id === id);
  if (!l) return null;
  if (!isAdmin && l.sellerId !== userId) return { error: '无权操作该挂单' };
  l.status = status;
  l.updatedAt = new Date().toISOString();
  saveListings(listings);
  return l;
}

// ---- 订单 ----
function getOrders() { return read('orders', []); }
function saveOrders(orders) { return write('orders', orders); }
function findOrder(id) { return getOrders().find((o) => o.id === id); }
function upsertOrder(order) {
  const orders = getOrders();
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx >= 0) orders[idx] = order; else orders.push(order);
  saveOrders(orders);
  return order;
}

// ---- 后台站点配置（支付密钥等）----
function getSiteConfig() { return read('config', {}); }
function saveSiteConfig(cfg) { return write('config', cfg); }

module.exports = {
  DATA_DIR,
  getUsers, saveUsers, findUserByEmail, findUserById,
  hashPassword, verifyPassword, createUser, sanitize,
  getListings, saveListings, createListing, updateListing, setListingStatus,
  getOrders, saveOrders, findOrder, upsertOrder,
  getSiteConfig, saveSiteConfig,
};
