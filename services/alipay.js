const crypto = require('crypto');
const config = require('../config');
const payConfig = require('./payment-config');

// 国际支付宝（Alipay Global / 跨境支付宝）支付服务
// 使用 alipay.trade.page.pay 网页支付，RSA2 签名
// 密钥来源：后台管理页面配置 > .env 环境变量
// 未配置密钥时进入 demo 模式

function getAlipayConfig() {
  return payConfig.getPaymentConfig().alipay;
}

function configured() {
  const c = getAlipayConfig();
  return Boolean(c.appId && c.privateKey);
}

// RSA2 签名
function sign(params, privateKey) {
  const content = Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto
    .createSign('RSA-SHA256')
    .update(content, 'utf8')
    .sign(privateKey, 'base64');
}

// 验签（异步通知）
function verify(params, publicKey) {
  const signStr = params.sign;
  const content = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'sign_type' && params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto
    .createVerify('RSA-SHA256')
    .update(content, 'utf8')
    .verify(publicKey, signStr, 'base64');
}

// 生成网页支付跳转地址
function createPagePayUrl({ orderId, amount, subject }) {
  const c = getAlipayConfig();
  const params = {
    app_id: c.appId,
    method: 'alipay.trade.page.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    version: '1.0',
    notify_url: c.notifyUrl,
    return_url: c.returnUrl,
    biz_content: JSON.stringify({
      out_trade_no: orderId,
      total_amount: amount.toFixed(2),
      subject,
      product_code: 'FAST_INSTANT_TRADE_PAY',
    }),
  };
  params.sign = sign(params, c.privateKey);
  return `${config.alipay.gateway}?${new URLSearchParams(params).toString()}`;
}

module.exports = { configured, createPagePayUrl, verify, sign };
