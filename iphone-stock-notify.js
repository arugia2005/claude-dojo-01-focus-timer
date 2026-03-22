const fs = require('fs');
const path = require('path');

// --- 設定（実際の部品番号をここに入れてください）
const LOCATION = '285-0845';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 1000 * 60 * 2); // 2分
const STATE_FILE = path.join(__dirname, 'stock-state.json');

if (!DISCORD_WEBHOOK_URL) {
  console.error('DISCORD_WEBHOOK_URL を環境変数で指定してください。');
  process.exit(1);
}

const products = [
  { model: 'iPhone 17 Pro 256GB MG854J/A', part: 'MG854J/A' },
  { model: 'iPhone 17 Pro 256GB MG864J/A', part: 'MG864J/A' },
  { model: 'iPhone 17 Pro 256GB MG874J/A', part: 'MG874J/A' },
  { model: 'iPhone 17 Pro Max 256GB MFY84J/A', part: 'MFY84J/A' },
  { model: 'iPhone 17 Pro Max 256GB MFY94J/A', part: 'MFY94J/A' },
  { model: 'iPhone 17 Pro Max 256GB MFYA4J/A', part: 'MFYA4J/A' },
];

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.warn('state load failed, reset:', err.message);
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function notifyDiscord(message) {
  const payload = { content: message };
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord通知失敗 ${res.status} ${text}`);
  }
}

function parseStock(data, part) {
  const stores = data?.body?.content?.pickupMessage?.stores || [];
  for (const store of stores) {
    const item = store?.parts?.[part];
    if (!item) continue;
    const pickupDisplay = (item.pickupDisplay || '').toLowerCase();
    const pickupQuote = (item.pickupSearchQuote || '').toLowerCase();
    if (pickupDisplay.includes('在庫あり') || pickupQuote.includes('在庫あり') || pickupDisplay.includes('available') || pickupQuote.includes('available')) {
      return true;
    }
  }
  return false;
}

async function checkProduct(product) {
  const url = `https://www.apple.com/jp/shop/fulfillment-messages?parts.0=${encodeURIComponent(product.part)}&location=${encodeURIComponent(LOCATION)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Referer': 'https://www.apple.com/jp/shop/buy-iphone/iphone-17-pro',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    },
  });
  if (!res.ok) {
    throw new Error(`Apple API ${res.status}`);
  }
  const data = await res.json();
  const stock = parseStock(data, product.part);
  return stock;
}

async function checkAll() {
  console.log(new Date().toISOString(), 'checking stock...');
  const state = loadState();
  let changed = false;

  for (const product of products) {
    try {
      const inStock = await checkProduct(product);
      const prev = Boolean(state[product.part]);
      state[product.part] = inStock;

      if (inStock && !prev) {
        const msg = `在庫あり！\n${product.model}\n郵便番号:${LOCATION}\nhttps://www.apple.com/jp/shop/product/${product.part}`;
        await notifyDiscord(msg);
        console.log('notify:', product.model);
        changed = true;
      } else {
        console.log(product.model, inStock ? '在庫あり' : '在庫なし');
      }
    } catch (err) {
      console.warn('check failed for', product.model, err.message);
    }
  }

  if (changed) {
    saveState(state);
  } else {
    saveState(state);
  }
}

(async () => {
  await checkAll();
  setInterval(checkAll, CHECK_INTERVAL_MS);
})();