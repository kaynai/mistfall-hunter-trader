/* ============ 雾影猎人交易站 · 公共逻辑 ============ */
const Store = {
  currency: localStorage.getItem('mh_currency') || 'CNY',
  cart: JSON.parse(localStorage.getItem('mh_cart') || '[]'),
  rates: null,
};

const CURRENCIES = [
  { code: 'CNY', symbol: '¥', name: '人民币', decimals: 2 },
  { code: 'USD', symbol: '$', name: '美元', decimals: 2 },
  { code: 'EUR', symbol: '€', name: '欧元', decimals: 2 },
  { code: 'GBP', symbol: '£', name: '英镑', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: '日元', decimals: 0 },
  { code: 'HKD', symbol: 'HK$', name: '港币', decimals: 2 },
  { code: 'KRW', symbol: '₩', name: '韩元', decimals: 0 },
  { code: 'AUD', symbol: 'A$', name: '澳元', decimals: 2 },
  { code: 'CAD', symbol: 'C$', name: '加元', decimals: 2 },
  { code: 'SGD', symbol: 'S$', name: '新加坡元', decimals: 2 },
  { code: 'CHF', symbol: 'CHF', name: '瑞士法郎', decimals: 2 },
  { code: 'MXN', symbol: 'MX$', name: '墨西哥比索', decimals: 2 },
];

function curSymbol(code) {
  const c = CURRENCIES.find((x) => x.code === code);
  return c ? c.symbol : code;
}
function curName(code) {
  const c = CURRENCIES.find((x) => x.code === code);
  return c ? c.name : code;
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
  // 1) 后端汇率 API（完整部署时使用，含每日缓存）
  try {
    const q = force ? '?force=1' : '';
    const res = await fetch('/api/rates' + q);
    if (res.ok) {
      Store.rates = await res.json();
      return Store.rates;
    }
  } catch (e) { console.warn('后端汇率 API 不可用，尝试浏览器直连…', e); }

  // 2) 浏览器直连免费汇率源（GitHub Pages 静态预览兜底，支持 CORS）
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

// 获取商品列表：优先后端 API，静态环境兜底读取本地 JSON
async function getListings() {
  try {
    const res = await fetch('/api/listings');
    if (res.ok) return await res.json();
  } catch (e) { /* ignore */ }
  return (await fetch('data/listings.json')).json();
}

// 人民币金额 → 当前展示币种
function cnyTo(cny) {
  if (!Store.rates || Store.currency === 'CNY') return Math.round(cny * 100) / 100;
  const rate = Store.rates.rates[Store.currency];
  if (!rate) return Math.round(cny * 100) / 100;
  return Math.round(cny * rate * 100) / 100;
}

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
  if (!silent) toast('已加入购物车');
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

// ---------- 头部 / 页脚渲染 ----------
const NAV = [
  { href: 'index.html', label: '首页' },
  { href: 'shop.html', label: '交易大厅' },
  { href: 'rates.html', label: '汇率行情' },
  { href: 'checkout.html', label: '结算支付' },
];

function renderHeader(active) {
  const header = document.getElementById('site-header');
  if (!header) return;
  header.innerHTML = `
    <div class="wrap header-inner">
      <a class="brand" href="index.html">
        <img src="img/logo.png" alt="雾影猎人交易站">
        <span>
          <span class="brand-name">雾影猎人交易站</span><br>
          <span class="brand-sub">Mistfall Hunter Trading Post</span>
        </span>
      </a>
      <nav class="main-nav">
        ${NAV.map((n) => `<a href="${n.href}" class="${n.href === active ? 'active' : ''}">${n.label}</a>`).join('')}
      </nav>
      <div class="header-tools">
        <div class="currency-select" id="currency-select">
          <button class="sel-btn" id="cur-btn"><span id="cur-code">${Store.currency}</span> <span class="caret">▼</span></button>
          <div class="currency-menu" id="cur-menu">
            ${CURRENCIES.map((c) => `
              <div class="cur-item ${c.code === Store.currency ? 'selected' : ''}" data-code="${c.code}">
                <span><span class="cur-code">${c.code}</span> · ${c.name}</span><span>${c.symbol}</span>
              </div>`).join('')}
          </div>
        </div>
        <a class="cart-btn" href="checkout.html" title="结算">
          <span>🛒</span><span class="lbl">购物车</span><span class="badge">${cartCount()}</span>
        </a>
      </div>
    </div>`;

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
      toast(`已切换为 ${Store.currency}（${curName(Store.currency)}）`);
      onCurrencyChange && onCurrencyChange();
    });
  });
}

function renderFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;
  footer.innerHTML = `
    <div class="wrap footer-inner">
      <div class="f-brand"><img src="img/logo.png" alt=""><b>雾影猎人交易站</b></div>
      <div class="f-links">
        <a href="shop.html">交易大厅</a><a href="rates.html">汇率行情</a><a href="checkout.html">支付方式</a>
        <a href="index.html#about">关于我们</a>
      </div>
      <div class="f-copy">© ${new Date().getFullYear()} 雾影猎人交易站 · 支持 PayPal（贝宝）与支付宝国际版 · 每日国际汇率实时计价</div>
    </div>`;
}

// 页面切换币种后的重渲染钩子（由各页面实现）
let onCurrencyChange = null;
window.__setCurrencyHook = (fn) => { onCurrencyChange = fn; };

document.addEventListener('DOMContentLoaded', () => {
  renderHeader(location.pathname.split('/').pop() || 'index.html');
  renderFooter();
});
