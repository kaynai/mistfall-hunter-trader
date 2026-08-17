const fs = require('fs');
const config = require('../config');

// 站内支持的展示币种
const SUPPORTED = [
  'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'KRW',
  'AUD', 'CAD', 'SGD', 'CHF', 'MXN', 'RUB',
];

let memory = null;

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(config.rates.cacheFile, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(data) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(config.rates.cacheFile, JSON.stringify(data, null, 2));
}

async function fetchFrom(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function normalize(ratesMap, time) {
  const out = {
    date: todayStr(),
    time,
    base: config.baseCurrency,
    source: '',
    rates: {},
  };
  for (const c of SUPPORTED) {
    if (ratesMap[c]) out.rates[c] = round4(ratesMap[c]);
  }
  return out;
}

// 抓取当日实时汇率（主源失败自动切换备用源）
async function fetchLive() {
  try {
    const data = await fetchFrom(config.rates.apiPrimary);
    if (data && data.result === 'success' && data.rates) {
      const out = normalize(data.rates, data.time_last_update_utc || new Date().toISOString());
      out.source = 'open.er-api.com';
      return out;
    }
    throw new Error('primary rate source failed');
  } catch (e) {
    const data = await fetchFrom(config.rates.apiFallback);
    if (!data || !data.rates) throw new Error('fallback rate source failed');
    const out = normalize(data.rates, new Date().toISOString());
    out.source = 'frankfurter.app (ECB)';
    return out;
  }
}

// 获取汇率：同一天内走缓存，跨天自动刷新
async function getRates(force = false) {
  if (memory && memory.date === todayStr() && !force) return memory;

  const cached = readCache();
  if (cached && cached.date === todayStr() && !force) {
    memory = cached;
    return cached;
  }

  const fresh = await fetchLive();
  writeCache(fresh);
  memory = fresh;
  return fresh;
}

// 按当日汇率将人民币金额换算为目标币种
function convert(amountCny, currency, ratesData) {
  if (currency === config.baseCurrency) return amountCny;
  const rate = ratesData && ratesData.rates[currency];
  if (!rate) return null;
  return Math.round(amountCny * rate * 100) / 100;
}

module.exports = { getRates, convert, SUPPORTED, todayStr };
