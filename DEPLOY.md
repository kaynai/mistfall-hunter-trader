# 雾影猎人交易站 · GitHub 托管 + 云端部署指南

本项目已开发完成，下面按步骤将代码托管到 GitHub，并通过云托管平台部署成可访问的网站。

> ⚠️ 本机需先安装 **git**（下载：https://git-scm.com），安装后重开终端。

---

## 一、推送到 GitHub

### 1. 在项目目录初始化并提交

在 `e:\1` 打开终端，执行：

```bash
git init
git add .
git commit -m "雾影猎人交易站：多币种汇率 + 贝宝/支付宝支付"
```

### 2. 在 GitHub 新建空仓库

1. 登录 https://github.com
2. 点右上角 `+` → `New repository`
3. 仓库名建议：`mistfall-hunter-trader`
4. 选择 **Public**（公开）或 **Private**（私有）
5. **不要**勾选 "Add a README"（避免冲突），直接 `Create repository`

### 3. 关联并推送

把下面的 `你的用户名` 和仓库名替换成你实际的：

```bash
git remote add origin https://github.com/你的用户名/mistfall-hunter-trader.git
git branch -M main
git push -u origin main
```

> 首次推送会要求登录 GitHub 账号授权。

---

## 二、云端部署（免费托管）

### 方式 A：Cloud Studio 云托管（推荐）

1. 打开 https://console.cloud.tencent.com/cloudstudio
2. 登录腾讯云，授权绑定你的 **GitHub** 账号
3. 选择 **「云托管」/「一键部署」** → 导入刚才的 `mistfall-hunter-trader` 仓库
4. 平台识别到 `package.json`，会自动：
   - 安装依赖：`npm install`
   - 启动服务：`npm start`（监听 3000 端口）
5. 部署完成后会生成一个 **https 公网网址**，打开即是你的交易网站

> 无需安装 Node/配置任何东西，全自动。

### 方式 B：GitHub 直接部署静态页（仅首页演示）

如果你只想先看前端效果（不含后端汇率/支付），可开 GitHub Pages：

1. 在仓库 `Settings → Pages`
2. Source 选 `main` 分支 + `/docs` 或 root
3. 稍等片刻，访问 `https://你的用户名.github.io/mistfall-hunter-trader/`
4. ⚠️ 注意：此方式仅静态页面，汇率和支付接口不可用

---

## 三、上线前需要配置的密钥

部署后，在云托管平台的「环境变量」中配置（对应 `.env.example`）：

```ini
# PayPal（https://developer.paypal.com 创建应用）
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=你的ClientId
PAYPAL_CLIENT_SECRET=你的ClientSecret

# 支付宝国际版（open.alipay.com 创建应用）
ALIPAY_APP_ID=
ALIPAY_APP_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
ALIPAY_NOTIFY_URL=https://你的域名/api/alipay/notify
ALIPAY_RETURN_URL=https://你的域名/checkout.html
```

> 不配置密钥时，网站照常运行，支付走「演示模式」，可完整体验下单流程。

---

## 四、常见问题

| 问题 | 解决 |
|------|------|
| `git` 不是内部命令 | 先安装 git：https://git-scm.com |
| 推送时提示认证失败 | 用 GitHub Personal Access Token 代替密码，或在网页登录授权 |
| 云托管无法启动 | 确认启动命令为 `npm start`，端口 3000 |
| 汇率显示"暂不可用" | 云平台需能访问外网 `open.er-api.com`，白名单放行 |
