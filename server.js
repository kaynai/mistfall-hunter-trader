const path = require('path');
const express = require('express');
const config = require('./config');
const rates = require('./services/rates');
const paypal = require('./services/paypal');
const alipay = require('./services/alipay');
const { listings, categories } = require('./data/listings');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 汇率 API ----------
// GET /api/rates           当日汇率（每日国际汇率，自动刷新缓存）
// GET /api/rates?force=1   强制刷新
app.get('/api/rates', async (req, res) => {
  try {
    const data = await rates.getRates(req.query.force === '1');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: '汇率源暂时不可用，请稍后重试', detail: e.message });
  }
});

// ---------- 商品 API ----------
app.get('/api/listings', (req, res) => {
  res.json({ base: config.baseCurrency, categories, listings });
});

// ---------- 订单系统 ----------
const orders = new Map();

function makeOrderId() {
  return (
    'MF' +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// 校验购物车并计算人民币总额
function validateCart(items) {
  let totalCny = 0;
  const detail = [];
  for (const it of items || []) {
    const item = listings.find((l) => l.id === it.id);
    if (!item) return null;
    const qty = Math.max(1, Math.min(Number(it.qty) || 1, 99));
    totalCny += item.priceCny * qty;
    detail.push({ id: item.id, name: item.name, qty, priceCny: item.priceCny });
  }
  if (detail.length === 0) return null;
  return { totalCny: round2(totalCny), detail };
}

// 创建订单：POST /api/orders { items, currency, payment: 'paypal' | 'alipay' }
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
      createdAt: new Date().toISOString(),
    };
    orders.set(id, order);

    // ---- 贝宝支付 ----
    if (payment === 'paypal') {
      if (!paypal.configured()) {
        order.status = 'demo_ready';
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
      return res.json({ orderId: id, payUrl, total, currency });
    }
  } catch (e) {
    console.error('[create order]', e);
    res.status(502).json({ error: '创建订单失败', detail: e.message });
  }
});

// 捕获 PayPal 订单（收款确认）：POST /api/orders/:id/capture
app.post('/api/orders/:id/capture', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'paypal_created') {
    return res.status(400).json({ error: '订单状态不允许收款' });
  }
  try {
    const result = await paypal.captureOrder(req.body.paypalOrderId);
    if (result.status === 'COMPLETED') {
      order.status = 'paid';
      res.json({ status: 'paid', orderId: order.id });
    } else {
      order.status = 'paypal_capture_pending';
      res.json({ status: result.status, orderId: order.id });
    }
  } catch (e) {
    console.error('[capture]', e);
    res.status(502).json({ error: '收款失败', detail: e.message });
  }
});

// 演示模式：模拟支付成功（未配置密钥时前端使用）
app.post('/api/orders/:id/demo-pay', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  order.status = 'paid';
  res.json({ status: 'paid', orderId: order.id, demo: true });
});

// 国际支付宝异步通知验签：POST /api/alipay/notify
app.post('/api/alipay/notify', async (req, res) => {
  const body = req.body || {};
  const order = orders.get(body.out_trade_no);
  if (!order) return res.status(404).send('fail');

  const ok = alipay.configured()
    ? alipay.verify(body, config.alipay.alipayPublicKey)
    : true; // 演示模式跳过验签

  if (ok && body.trade_status === 'TRADE_SUCCESS') {
    order.status = 'paid';
    order.alipayTradeNo = body.trade_no;
    return res.send('success');
  }
  res.send('fail');
});

// 查询订单：GET /api/orders/:id
app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  res.json(order);
});

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, name: config.site.name }));

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n  ${config.site.name} 已启动`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
  console.log(`  汇率源: ${config.rates.apiPrimary}`);
  console.log(`  PayPal: ${paypal.configured() ? '已配置(' + config.paypal.mode + ')' : '演示模式(未配置密钥)'}`);
  console.log(`  Alipay: ${alipay.configured() ? '已配置' : '演示模式(未配置密钥)'}\n`);
});
