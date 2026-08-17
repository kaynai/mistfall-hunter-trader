# 雾影猎人交易站 (Mistfall Hunter Trading Post)

一个面向《雾影猎人》游戏的**国际化交易平台**，支持雾晶货币与游戏装备挂单交易，**按每日国际汇率多币种计价**，并对接**贝宝 PayPal** 与**国际支付宝 Alipay Global** 两种支付方式。

## ✨ 功能特性

- 🌐 **每日国际汇率**：对接国际实时汇率源（主源 open.er-api.com，备用源 Frankfurter/欧洲央行），跨天自动刷新，支持 12 种主流货币（USD 美元、EUR 欧元、GBP 英镑、JPY 日元、HKD 港币、KRW 韩元、AUD、CAD、SGD、CHF、MXN、CNY）。
- 💰 **多币种实时计价**：页面右上角切换币种，所有商品价格、购物车、结算金额即时换算。
- 🛒 **交易大厅**：按品类浏览/搜索商品，一键加入购物车。
- 💳 **贝宝 PayPal**：通过 PayPal REST API 创建订单并跳转授权收款。
- 🌐 **支付宝国际版**：通过 openapi 生成 `alipay.trade.page.pay` 网页支付跳转地址，支持异步通知验签。
- 🧪 **演示模式**：未配置支付密钥时自动进入演示流程，可完整体验下单 → 支付 → 成功全链路。

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 复制并配置环境变量（不配支付密钥也能以"演示模式"运行）
copy .env.example .env

# 3. 启动
npm start
```

打开 http://localhost:3000 即可访问。

## 🧰 技术栈

- 后端：Node.js + Express（无第三方支付 SDK，直接调用官方 REST API）
- 前端：原生 HTML/CSS/JS，暗黑奇幻风格 UI
- 数据：文件缓存（汇率按日缓存 `data/rates.json`）

## 🔑 支付对接配置

编辑 `.env`：

```ini
# PayPal（https://developer.paypal.com 创建应用）
PAYPAL_MODE=sandbox        # 上线改 live
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=

# 支付宝国际版（open.alipay.com 创建应用）
ALIPAY_APP_ID=
ALIPAY_APP_PRIVATE_KEY=    # RSA2 私钥，多行用 \n 转义
ALIPAY_PUBLIC_KEY=         # 支付宝公钥，异步通知验签用
ALIPAY_NOTIFY_URL=         # 需公网可访问，如 https://your-domain.com/api/alipay/notify
ALIPAY_RETURN_URL=
```

配置完成后重启服务，控制台会显示各支付通道状态。

## 📁 目录结构

```
├── server.js            # 主服务：路由 + 订单系统
├── config.js            # 全局配置
├── .env.example         # 密钥配置模板
├── services/
│   ├── rates.js         # 每日汇率（缓存 + 双源容灾）
│   ├── paypal.js        # 贝宝 REST API
│   └── alipay.js        # 支付宝 RSA2 签名/验签 + 支付链接
├── data/
│   └── listings.js      # 商品挂单数据（正式上线请换数据库）
└── public/              # 前端页面与素材
    ├── index.html       # 首页
    ├── shop.html        # 交易大厅
    ├── rates.html       # 汇率行情 + 换算器
    ├── checkout.html    # 结算支付
    ├── css/style.css
    └── js/common.js
```

## ⚠️ 上线前建议

1. 将 `data/listings.js` 替换为真实数据库（商品、库存、卖家账户）。
2. 支付密钥切换到正式环境（`live`），并配置公网 HTTPS 域名与通知地址。
3. 为订单系统接入持久化存储（当前为内存 Map，重启丢失）。
4. 补充卖家结算、退款、风控与客服后台。
