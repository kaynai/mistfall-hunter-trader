require('dotenv').config();

// 全局配置：所有密钥通过环境变量（.env 文件）注入
module.exports = {
  port: Number(process.env.PORT) || 3000,

  // 基准货币（站内商品默认以 CNY 定价，展示时按每日汇率换算）
  baseCurrency: 'CNY',

  dataDir: 'data',

  rates: {
    // 缓存文件：服务启动后首次访问按"日期"判断是否需要刷新（每日更新）
    cacheFile: 'data/rates.json',
    // 主汇率源：open.er-api.com（免费、每日更新、无需 API Key）
    apiPrimary: 'https://open.er-api.com/v6/latest/CNY',
    // 备用汇率源：Frankfurter（欧洲央行基准汇率，每日更新）
    apiFallback: 'https://api.frankfurter.app/latest?from=CNY',
  },

  paypal: {
    mode: process.env.PAYPAL_MODE || 'sandbox', // sandbox | live
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    baseUrl:
      (process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com'),
  },

  alipay: {
    // 国际支付宝（Alipay Global / 跨境支付宝）：openapi.alipay.com
    appId: process.env.ALIPAY_APP_ID || '',
    // 应用私钥（RSA2，PEM 格式，内容里的换行用 \n 转义）
    privateKey: process.env.ALIPAY_APP_PRIVATE_KEY || '',
    // 支付宝公钥（用于异步通知验签）
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    gateway: 'https://openapi.alipay.com/gateway.do',
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
    returnUrl: process.env.ALIPAY_RETURN_URL || '',
  },

  site: {
    name: '雾影猎人交易站',
    nameEn: 'Mistfall Hunter Trading Post',
  },
};
