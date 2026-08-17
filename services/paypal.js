const config = require('../config');
const payConfig = require('./payment-config');

// PayPal 支付服务：直接调用 PayPal REST API（无需额外 SDK）
// 密钥来源：后台管理页面配置 > .env 环境变量
// 未配置密钥时进入 demo 模式

let tokenCache = { token: null, expiresAt: 0 };

function getPaypalConfig() {
  return payConfig.getPaymentConfig().paypal;
}

function configured() {
  const c = getPaypalConfig();
  return Boolean(c.clientId && c.clientSecret);
}

function baseUrl() {
  const c = getPaypalConfig();
  return c.mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60 * 1000) {
    return tokenCache.token;
  }
  const c = getPaypalConfig();
  const auth = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal token error: HTTP ${res.status}`);
  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 32400) * 1000,
  };
  return data.access_token;
}

// 创建 PayPal 订单
async function createOrder({ amount, currency, reference, description }) {
  const token = await getToken();
  const res = await fetch(`${baseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: reference,
          description,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal create order error: ${body}`);
  }
  return res.json();
}

// 捕获（收款）PayPal 订单
async function captureOrder(orderId) {
  const token = await getToken();
  const res = await fetch(
    `${baseUrl()}/v2/checkout/orders/${orderId}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal capture error: ${body}`);
  }
  return res.json();
}

module.exports = { configured, createOrder, captureOrder };
