// 支付配置服务
// 优先级：后台管理页面保存的配置 > 环境变量（.env）
// 这样管理员可在网页后台直接填入支付宝/贝宝密钥，无需改代码
const db = require('./db');
const envConfig = require('../config');

function getPaymentConfig() {
  const saved = db.getSiteConfig().payment || {};
  return {
    // PayPal
    paypal: {
      mode: saved.paypal?.mode || envConfig.paypal.mode || 'sandbox',
      clientId: saved.paypal?.clientId || envConfig.paypal.clientId || '',
      clientSecret: saved.paypal?.clientSecret || envConfig.paypal.clientSecret || '',
    },
    // Alipay
    alipay: {
      appId: saved.alipay?.appId || envConfig.alipay.appId || '',
      privateKey: saved.alipay?.privateKey || envConfig.alipay.privateKey || '',
      alipayPublicKey: saved.alipay?.alipayPublicKey || envConfig.alipay.alipayPublicKey || '',
      notifyUrl: saved.alipay?.notifyUrl || envConfig.alipay.notifyUrl || '',
      returnUrl: saved.alipay?.returnUrl || envConfig.alipay.returnUrl || '',
    },
  };
}

// 返回给后台页面的配置（密钥脱敏，仅显示是否已配置）
function getPublicPaymentStatus() {
  const c = getPaymentConfig();
  return {
    paypal: {
      mode: c.paypal.mode,
      configured: Boolean(c.paypal.clientId && c.paypal.clientSecret),
      hasClientId: Boolean(c.paypal.clientId),
      hasClientSecret: Boolean(c.paypal.clientSecret),
      // 不返回明文密钥
    },
    alipay: {
      configured: Boolean(c.alipay.appId && c.alipay.privateKey),
      hasAppId: Boolean(c.alipay.appId),
      hasPrivateKey: Boolean(c.alipay.privateKey),
      hasPublicKey: Boolean(c.alipay.alipayPublicKey),
    },
  };
}

// 保存支付配置（仅允许填写非空字段；返回成功状态）
function savePaymentConfig(adminUserId, input) {
  const current = db.getSiteConfig();
  const payment = current.payment || {};

  // PayPal
  const paypalInput = input.paypal || {};
  const pp = { ...(payment.paypal || {}) };
  if (paypalInput.mode !== undefined) pp.mode = paypalInput.mode === 'live' ? 'live' : 'sandbox';
  if (paypalInput.clientId !== undefined && paypalInput.clientId.trim() !== '') pp.clientId = paypalInput.clientId.trim();
  if (paypalInput.clientSecret !== undefined && paypalInput.clientSecret.trim() !== '') pp.clientSecret = paypalInput.clientSecret.trim();
  payment.paypal = pp;

  // Alipay
  const alipayInput = input.alipay || {};
  const ap = { ...(payment.alipay || {}) };
  if (alipayInput.appId !== undefined && alipayInput.appId.trim() !== '') ap.appId = alipayInput.appId.trim();
  if (alipayInput.privateKey !== undefined && alipayInput.privateKey.trim() !== '') ap.privateKey = alipayInput.privateKey.trim();
  if (alipayInput.alipayPublicKey !== undefined && alipayInput.alipayPublicKey.trim() !== '') ap.alipayPublicKey = alipayInput.alipayPublicKey.trim();
  if (alipayInput.notifyUrl !== undefined && alipayInput.notifyUrl.trim() !== '') ap.notifyUrl = alipayInput.notifyUrl.trim();
  if (alipayInput.returnUrl !== undefined && alipayInput.returnUrl.trim() !== '') ap.returnUrl = alipayInput.returnUrl.trim();
  payment.alipay = ap;

  current.payment = payment;
  db.saveSiteConfig(current);
  return getPublicPaymentStatus();
}

module.exports = { getPaymentConfig, getPublicPaymentStatus, savePaymentConfig };
