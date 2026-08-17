const path = require('path');
const express = require('express');
const config = require('./config');
const rates = require('./services/rates');
const paypal = require('./services/paypal');
const alipay = require('./services/alipay');
const db = require('./services/db');
const session = require('./services/session');
const payConfig = require('./services/payment-config');
const { listings: staticListings, categories } = require('./data/listings');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true })); // 支付宝通知是表单格式
app.use(express.static(path.join(__dirname, 'public')));
app.use(session.auth); // 解析 req.user

// ==================== 汇率 API ====================
app.get('/api/rates', async (req, res) => {
  try {
    const data = await rates.getRates(req.query.force === '1');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: '汇率源暂时不可用，请稍后重试', detail: e.message });
  }
});

// ==================== 商品 API（静态 + 卖家动态挂单合并）====================
function publicListings() {
  const seller = db
    .getListings()
    .filter((l) => l.status === 'active') // 仅展示已上架
    .map((l) => ({ ...l, sellerListing: true }));
  // 静态挂单
  const stat = staticListings.map((l) => ({ ...l, sellerListing: false }));
  return [...seller, ...stat];
}

app.get('/api/listings', (req, res) => {
  res.json({ base: config.baseCurrency, categories, listings: publicListings() });
});

// ==================== 用户认证 ====================
// 注册
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  if (db.findUserByEmail(email)) return res.status(409).json({ error: '该邮箱已注册' });

  // 卖家注册：role 可为 'seller'；默认买家
  const userRole = role === 'seller' ? 'seller' : 'buyer';
  const user = db.createUser({ email, password, name, role: userRole });
  const token = session.createToken(user.id);
  res.json({ token, user });
});

// 登录
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.findUserByEmail(email);
  if (!user || !db.verifyPassword(user, String(password || ''))) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  const token = session.createToken(user.id);
  res.json({ token, user: db.sanitize(user) });
});

// 找回密码（演示：直接重置为新密码；生产环境应发邮件验证）
app.post('/api/auth/forgot', (req, res) => {
  const { email, newPassword } = req.body || {};
  const user = db.findUserByEmail(email);
  if (!user) return res.status(404).json({ error: '该邮箱未注册' });
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: '新密码至少 6 位' });
  }
  const users = db.getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  const { salt, hash } = db.hashPassword(String(newPassword));
  users[idx].salt = salt;
  users[idx].hash = hash;
  db.saveUsers(users);
  res.json({ ok: true, message: '密码已重置，请用新密码登录' });
});

// 当前登录用户信息
app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  res.json({ user: db.sanitize(req.user) });
});

// 退出登录
app.post('/api/auth/logout', (req, res) => {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  session.destroyToken(token);
  res.json({ ok: true });
});

// ==================== 卖家挂单管理（需登录）====================
// 获取当前用户的挂单
app.get('/api/seller/listings', session.requireAuth, (req, res) => {
  const mine = db.getListings().filter((l) => l.sellerId === req.user.id);
  res.json({ listings: mine });
});

// 发布新挂单（卖家上架）
app.post('/api/seller/listings', session.requireAuth, (req, res) => {
  const { name, category, priceCny, stock, description } = req.body || {};
  if (!name) return res.status(400).json({ error: '商品名称不能为空' });
  if (!(priceCny > 0)) return res.status(400).json({ error: '请填写有效的价格（人民币）' });
  const listing = db.createListing({
    sellerId: req.user.id,
    sellerName: req.user.name || req.user.email,
    name,
    category,
    priceCny: Number(priceCny),
    stock: Number(stock) || 1,
    description,
    status: 'active', // 卖家发布默认立即上架
  });
  res.json({ listing });
});

// 编辑挂单
app.put('/api/seller/listings/:id', session.requireAuth, (req, res) => {
  const r = db.updateListing(req.params.id, req.body || {}, req.user.id, req.user.role === 'admin');
  if (!r) return res.status(404).json({ error: '挂单不存在' });
  if (r.error) return res.status(403).json({ error: r.error });
  res.json({ listing: r });
});

// 上架/下架
app.post('/api/seller/listings/:id/status', session.requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: '状态无效' });
  const r = db.setListingStatus(req.params.id, status, req.user.id, req.user.role === 'admin');
  if (!r) return res.status(404).json({ error: '挂单不存在' });
  if (r.error) return res.status(403).json({ error: r.error });
  res.json({ listing: r, message: status === 'active' ? '已上架' : '已下架' });
});

// 删除挂单
app.delete('/api/seller/listings/:id', session.requireAuth, (req, res) => {
  const all = db.getListings();
  const idx = all.findIndex((l) => l.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '挂单不存在' });
  const l = all[idx];
  if (l.sellerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权删除该挂单' });
  }
  all.splice(idx, 1);
  db.saveListings(all);
  res.json({ ok: true });
});

// ==================== 后台管理（仅管理员）====================
// 查看支付配置状态（脱敏）
app.get('/api/admin/payment-config', session.requireAdmin, (req, res) => {
  res.json(payConfig.getPublicPaymentStatus());
});

// 保存支付配置
app.post('/api/admin/payment-config', session.requireAdmin, (req, res) => {
  const status = payConfig.savePaymentConfig(req.user.id, req.body || {});
  res.json({ ok: true, status });
});

// 查看所有挂单（管理用）
app.get('/api/admin/listings', session.requireAdmin, (req, res) => {
  res.json({ listings: db.getListings() });
});

// ==================== 订单系统 ====================
function round2(n) {
  return Math.round(n * 100) / 100;
}

function makeOrderId() {
  return (
    'MF' +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

// 校验购物车并计算人民币总额（支持卖家动态挂单）
function validateCart(items) {
  const all = publicListings();
  let totalCny = 0;
  const detail = [];
  for (const it of items || []) {
    const item = all.find((l) => l.id === it.id);
    if (!item) return null;
    const qty = Math.max(1, Math.min(Number(it.qty) || 1, 99));
    totalCny += item.priceCny * qty;
    detail.push({ id: item.id, name: item.name, qty, priceCny: item.priceCny });
  }
  if (detail.length === 0) return null;
  return { totalCny: round2(totalCny), detail };
}

// 创建订单
app.post('/api/orders', async (req, res) => {
  try {
    const { items, currency = 'CNY', payment } = req.body || {};
    const cart = validateCart(items);
    if (!cart) return res.status(400).json({ error: '购物车为空或商品无效' });
    if (!['paypal', 'alipay'].includes(payment)) {
      return res.status(400).json({ error: '不支持的支付方式' });
    }

    const id = makeOrderId();
    const ratesData = await rates.getRates();
    const rate = ratesData.rates[currency] ?? 1;
    const total = round2(cart.totalCny * rate);

    const order = {
      id,
      items: cart.detail,
      totalCny: cart.totalCny,
      currency,
      total,
      rate: round2(rate * 10000) / 10000,
      payment,
      status: 'pending',
      buyerId: req.user ? req.user.id : null,
      buyerEmail: req.user ? req.user.email : null,
      createdAt: new Date().toISOString(),
    };
    db.upsertOrder(order);

    // ---- 贝宝支付 ----
    if (payment === 'paypal') {
      if (!paypal.configured()) {
        order.status = 'demo_ready';
        db.upsertOrder(order);
        return res.json({
          orderId: id,
          demo: true,
          message: '未配置 PayPal 密钥，当前为演示模式',
          total,
          currency,
        });
      }
      const pp = await paypal.createOrder({
        amount: total,
        currency,
        reference: id,
        description: `雾影猎人交易站订单 #${id}`,
      });
      order.status = 'paypal_created';
      order.paypalOrderId = pp.id;
      db.upsertOrder(order);
      return res.json({
        orderId: id,
        paypalOrderId: pp.id,
        approveLink: (pp.links || []).find((l) => l.rel === 'approve')?.href,
        total,
        currency,
      });
    }

    // ---- 国际支付宝支付 ----
    if (payment === 'alipay') {
      if (!alipay.configured()) {
        order.status = 'demo_ready';
        db.upsertOrder(order);
        return res.json({
          orderId: id,
          demo: true,
          message: '未配置支付宝密钥，当前为演示模式',
          total,
          currency,
        });
      }
      const payUrl = alipay.createPagePayUrl({
        orderId: id,
        amount: total,
        subject: `雾影猎人交易站订单 #${id}`,
      });
      order.status = 'alipay_redirect';
      db.upsertOrder(order);
      return res.json({ orderId: id, payUrl, total, currency });
    }
  } catch (e) {
    console.error('[create order]', e);
    res.status(502).json({ error: '创建订单失败', detail: e.message });
  }
});

// 捕获 PayPal 订单（收款确认）
app.post('/api/orders/:id/capture', async (req, res) => {
  const order = db.findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'paypal_created') {
    return res.status(400).json({ error: '订单状态不允许收款' });
  }
  try {
    const result = await paypal.captureOrder(req.body.paypalOrderId);
    if (result.status === 'COMPLETED') {
      order.status = 'paid';
      db.upsertOrder(order);
      res.json({ status: 'paid', orderId: order.id });
    } else {
      order.status = 'paypal_capture_pending';
      db.upsertOrder(order);
      res.json({ status: result.status, orderId: order.id });
    }
  } catch (e) {
    console.error('[capture]', e);
    res.status(502).json({ error: '收款失败', detail: e.message });
  }
});

// 演示模式：模拟支付成功
app.post('/api/orders/:id/demo-pay', (req, res) => {
  const order = db.findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  order.status = 'paid';
  db.upsertOrder(order);
  res.json({ status: 'paid', orderId: order.id, demo: true });
});

// 国际支付宝异步通知验签
app.post('/api/alipay/notify', async (req, res) => {
  const body = req.body || {};
  const order = db.findOrder(body.out_trade_no);
  if (!order) return res.status(404).send('fail');

  const ok = alipay.configured()
    ? alipay.verify(body, payConfig.getPaymentConfig().alipay.alipayPublicKey)
    : true; // 演示模式跳过验签

  if (ok && body.trade_status === 'TRADE_SUCCESS') {
    order.status = 'paid';
    order.alipayTradeNo = body.trade_no;
    db.upsertOrder(order);
    return res.send('success');
  }
  res.send('fail');
});

// 查询订单
app.get('/api/orders/:id', (req, res) => {
  const order = db.findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  res.json(order);
});

// 我的订单（买家/卖家查询自己的订单）
app.get('/api/my/orders', session.requireAuth, (req, res) => {
  const all = db.getOrders();
  const mine = all.filter((o) => o.buyerId === req.user.id);
  res.json({ orders: mine });
});

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, name: config.site.name }));

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n  ${config.site.name} 已启动`);
  console.log(`  ➜  http://localhost:${PORT}`);
  console.log(`  数据目录: ${db.DATA_DIR}`);
  console.log(`  PayPal: ${paypal.configured() ? '已配置' : '演示模式(未配置密钥)'}`);
  console.log(`  Alipay: ${alipay.configured() ? '已配置' : '演示模式(未配置密钥)'}`);
  console.log(`  提示: 支付密钥可在后台管理页面填写（登录 admin 后访问 /admin.html）\n`);
});
