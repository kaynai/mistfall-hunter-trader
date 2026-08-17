const crypto = require('crypto');
const config = require('../config');

// 国际支付宝（Alipay Global / 跨境支付宝）支付服务
// 使用 alipay.trade.page.pay 网页支付，RSA2 签名
// 未配置密钥时进入 demo 模式，便于本地联调前端流程

function configured() {
  return Boolean(config.alipay.appId && config.alipay.privateKey);
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
  const params = {
    app_id: config.alipay.appId,
    method: 'alipay.trade.page.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    version: '1.0',
    notify_url: config.alipay.notifyUrl,
    return_url: config.alipay.returnUrl,
    biz_content: JSON.stringify({
      out_trade_no: orderId,
      total_amount: amount.toFixed(2),
      subject,
      product_code: 'FAST_INSTANT_TRADE_PAY',
    }),
  };
  params.sign = sign(params, config.alipay.privateKey);
  return `${config.alipay.gateway}?${new URLSearchParams(params).toString()}`;
}

module.exports = { configured, createPagePayUrl, verify, sign };
