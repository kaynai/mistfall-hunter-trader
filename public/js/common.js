/* ============ 雾影猎人交易站 · 公共逻辑 ============ */
const Store = {
  currency: localStorage.getItem('mh_currency') || 'CNY',
  cart: JSON.parse(localStorage.getItem('mh_cart') || '[]'),
  rates: null,
  lang: localStorage.getItem('mh_lang') || 'zh', // zh 中文 | en 英文
  token: localStorage.getItem('mh_token') || '',
  user: JSON.parse(localStorage.getItem('mh_user') || 'null'),
};

/* ---------- 国际化（中英双语） ---------- */
const I18N = {
  zh: {
    brandName: '雾影猎人交易站',
    brandSub: 'Mistfall Hunter Trading Post',
    nav: {
      index: '首页', shop: '交易大厅', rates: '汇率行情', checkout: '结算支付',
      account: '我的账户', admin: '后台管理',
    },
    cart: '购物车',
    joinCart: '已加入购物车',
    login: '登录', register: '注册', logout: '退出',
    account: '账户',
    currencySwitch: '已切换为',
    langSwitch: 'EN',
    footerAbout: '关于我们',
    footerPay: '支持 PayPal（贝宝）与支付宝国际版 · 每日国际汇率实时计价',
    loadFail: '加载失败',
  },
  en: {
    brandName: 'Mistfall Hunter Trading Post',
    brandSub: '雾影猎人交易站',
    nav: {
      index: 'Home', shop: 'Trade Hall', rates: 'FX Rates', checkout: 'Checkout',
      account: 'My Account', admin: 'Admin',
    },
    cart: 'Cart',
    joinCart: 'Added to cart',
    login: 'Log in', register: 'Sign up', logout: 'Log out',
    account: 'Account',
    currencySwitch: 'Switched to',
    langSwitch: '中文',
    footerAbout: 'About Us',
    footerPay: 'Powered by PayPal & Alipay Global · Live daily FX rates',
    loadFail: 'Failed to load',
  },
};

function t(key) {
  const dict = I18N[Store.lang] || I18N.zh;
  return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : key), dict);
}

function switchLang(lang) {
  Store.lang = lang === 'en' ? 'en' : 'zh';
  localStorage.setItem('mh_lang', Store.lang);
  document.documentElement.lang = Store.lang;
  window.__onLangChange && window.__onLangChange();
}

/* ---------- 用户会话 ---------- */
function setAuth(token, user) {
  Store.token = token || '';
  Store.user = user || null;
  localStorage.setItem('mh_token', Store.token);
  localStorage.setItem('mh_user', JSON.stringify(Store.user));
  updateHeaderTools();
  window.__onAuthChange && window.__onAuthChange();
}

function isLoggedIn() {
  return Boolean(Store.token && Store.user);
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && Store.token) headers['Authorization'] = 'Bearer ' + Store.token;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

async function initAuth() {
  if (!Store.token) return;
  try {
    const d = await api('/api/auth/me', { auth: true });
    Store.user = d.user;
    localStorage.setItem('mh_user', JSON.stringify(Store.user));
  } catch (e) {
    // token 失效则清除
    Store.token = '';
    Store.user = null;
    localStorage.removeItem('mh_token');
    localStorage.removeItem('mh_user');
  }
  updateHeaderTools();
}

/* ---------- 货币 ---------- */
const CURRENCIES = [
  { code: 'CNY', symbol: '¥', name: '人民币', nameEn: 'CNY', decimals: 2 },
  { code: 'USD', symbol: '$', name: '美元', nameEn: 'USD', decimals: 2 },
  { code: 'EUR', symbol: '€', name: '欧元', nameEn: 'EUR', decimals: 2 },
  { code: 'GBP', symbol: '£', name: '英镑', nameEn: 'GBP', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: '日元', nameEn: 'JPY', decimals: 0 },
  { code: 'HKD', symbol: 'HK$', name: '港币', nameEn: 'HKD', decimals: 2 },
  { code: 'KRW', symbol: '₩', name: '韩元', nameEn: 'KRW', decimals: 0 },
  { code: 'AUD', symbol: 'A$', name: '澳元', nameEn: 'AUD', decimals: 2 },
  { code: 'CAD', symbol: 'C$', name: '加元', nameEn: 'CAD', decimals: 2 },
  { code: 'SGD', symbol: 'S$', name: '新加坡元', nameEn: 'SGD', decimals: 2 },
  { code: 'CHF', symbol: 'CHF', name: '瑞士法郎', nameEn: 'CHF', decimals: 2 },
  { code: 'MXN', symbol: 'MX$', name: '墨西哥比索', nameEn: 'MXN', decimals: 2 },
];

function curSymbol(code) {
  const c = CURRENCIES.find((x) => x.code === code);
  return c ? c.symbol : code;
}
function curName(code) {
  const c = CURRENCIES.find((x) => x.code === code);
  return c ? (Store.lang === 'en' ? c.nameEn : c.name) : code;
}
function curDecimals(code) {
  const c = CURRENCIES.find((x) => x.code === code);
  return c ? c.decimals : 2;
}

function fmtMoney(amount, currency = Store.currency) {
  const d = curDecimals(currency);
  return `${curSymbol(currency)} ${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })}`;
}

async function loadRates(force = false) {
  try {
    const q = force ? '?force=1' : '';
    const res = await fetch('/api/rates' + q);
    if (res.ok) {
      Store.rates = await res.json();
      return Store.rates;
    }
  } catch (e) { console.warn('后端汇率 API 不可用，尝试浏览器直连…', e); }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/CNY');
    if (!res.ok) throw new Error('cors rates error');
    const d = await res.json();
    if (d && d.result === 'success' && d.rates) {
      const rates = {};
      for (const c of CURRENCIES) if (d.rates[c.code]) rates[c.code] = d.rates[c.code];
      Store.rates = {
        date: (d.time_last_update_utc || '').slice(0, 10),
        source: 'open.er-api.com',
        base: 'CNY',
        rates,
      };
      return Store.rates;
    }
  } catch (e) { console.warn('浏览器直连汇率失败:', e); }
  return null;
}

async function getListings() {
  try {
    const res = await fetch('/api/listings');
    if (res.ok) return await res.json();
  } catch (e) { /* ignore */ }
  return (await fetch('data/listings.json')).json();
}

function cnyTo(cny) {
  if (!Store.rates || Store.currency === 'CNY') return Math.round(cny * 100) / 100;
  const rate = Store.rates.rates[Store.currency];
  if (!rate) return Math.round(cny * 100) / 100;
  return Math.round(cny * rate * 100) / 100;
}

/* ---------- 购物车 ---------- */
function cartCount() {
  return Store.cart.reduce((s, it) => s + it.qty, 0);
}
function saveCart() {
  localStorage.setItem('mh_cart', JSON.stringify(Store.cart));
  const badge = document.querySelector('.cart-btn .badge');
  if (badge) badge.textContent = cartCount();
}
function addToCart(id, qty = 1, silent = false) {
  const found = Store.cart.find((it) => it.id === id);
  if (found) found.qty += qty;
  else Store.cart.push({ id, qty });
  saveCart();
  if (!silent) toast(t('joinCart'));
}

function toast(msg) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, 2200);
}

/* ---------- 头部 / 页脚渲染 ---------- */
function renderHeader(active) {
  const header = document.getElementById('site-header');
  if (!header) return;
  header.innerHTML = `
    <div class="wrap header-inner">
      <a class="brand" href="index.html">
        <img src="img/logo.png" alt="">
        <span>
          <span class="brand-name">${t('brandName')}</span><br>
          <span class="brand-sub">${t('brandSub')}</span>
        </span>
      </a>
      <nav class="main-nav">
        ${[
          { href: 'index.html', k: 'index' },
          { href: 'shop.html', k: 'shop' },
          { href: 'rates.html', k: 'rates' },
          { href: 'checkout.html', k: 'checkout' },
          { href: 'account.html', k: 'account' },
        ].map((n) => `<a href="${n.href}" class="${n.href === active ? 'active' : ''}">${t('nav.' + n.k)}</a>`).join('')}
      </nav>
      <div class="header-tools">
        <div class="lang-switch">
          <button class="sel-btn lang-btn" id="lang-btn">${Store.lang === 'zh' ? 'EN' : '中文'}</button>
        </div>
        <div class="currency-select" id="currency-select">
          <button class="sel-btn" id="cur-btn"><span id="cur-code">${Store.currency}</span> <span class="caret">▼</span></button>
          <div class="currency-menu" id="cur-menu">
            ${CURRENCIES.map((c) => `
              <div class="cur-item ${c.code === Store.currency ? 'selected' : ''}" data-code="${c.code}">
                <span><span class="cur-code">${c.code}</span> · ${curName(c.code)}</span><span>${c.symbol}</span>
              </div>`).join('')}
          </div>
        </div>
        <a class="cart-btn" href="checkout.html" title="${t('cart')}">
          <span>🛒</span><span class="lbl">${t('cart')}</span><span class="badge">${cartCount()}</span>
        </a>
        <span id="header-account"></span>
      </div>
    </div>`;

  // 语言切换
  document.getElementById('lang-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    switchLang(Store.lang === 'zh' ? 'en' : 'zh');
  });

  // 币种切换
  const btn = document.getElementById('cur-btn');
  const menu = document.getElementById('cur-menu');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#currency-select')) menu.classList.remove('open');
  });
  menu.querySelectorAll('.cur-item').forEach((el) => {
    el.addEventListener('click', () => {
      Store.currency = el.dataset.code;
      localStorage.setItem('mh_currency', Store.currency);
      document.getElementById('cur-code').textContent = Store.currency;
      menu.classList.remove('open');
      toast(`${t('currencySwitch')} ${Store.currency}`);
      window.__onCurrencyChange && window.__onCurrencyChange();
    });
  });

  updateHeaderTools();
}

function updateHeaderTools() {
  const el = document.getElementById('header-account');
  if (!el) return;
  if (isLoggedIn()) {
    el.innerHTML = `
      <a class="account-chip" href="account.html" title="${Store.user.name || Store.user.email}">
        <span class="avatar">${(Store.user.name || Store.user.email || 'U').charAt(0).toUpperCase()}</span>
        <span class="acc-name">${Store.user.role === 'seller' ? '👑 ' : ''}${Store.user.name || Store.user.email}</span>
      </a>`;
    if (Store.user.role === 'admin') {
      const admin = document.querySelector('.main-nav');
      if (admin && !document.querySelector('.main-nav a[href="admin.html"]')) {
        admin.insertAdjacentHTML('beforeend', `<a href="admin.html">${t('nav.admin')}</a>`);
      }
    }
  } else {
    el.innerHTML = `<a class="sel-btn login-btn" href="account.html">${t('login')} / ${t('register')}</a>`;
  }
}

function renderFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;
  footer.innerHTML = `
    <div class="wrap footer-inner">
      <div class="f-brand"><img src="img/logo.png" alt=""><b>${t('brandName')}</b></div>
      <div class="f-links">
        <a href="shop.html">${t('nav.shop')}</a><a href="rates.html">${t('nav.rates')}</a><a href="checkout.html">${t('nav.checkout')}</a>
        <a href="index.html#about">${t('footerAbout')}</a>
      </div>
      <div class="f-copy">© ${new Date().getFullYear()} ${t('brandName')} · ${t('footerPay')}</div>
    </div>`;
}

window.__onCurrencyChange = null;
window.__onLangChange = null;
window.__onAuthChange = null;

document.addEventListener('DOMContentLoaded', async () => {
  document.documentElement.lang = Store.lang;
  renderHeader(location.pathname.split('/').pop() || 'index.html');
  renderFooter();
  await initAuth(); // 尝试恢复登录态
  // 若页面未自定义语言切换 hook，则仅重渲染头部/页脚
  if (!window.__onLangChange) {
    window.__onLangChange = () => {
      renderHeader(location.pathname.split('/').pop() || 'index.html');
      renderFooter();
    };
  }
});
