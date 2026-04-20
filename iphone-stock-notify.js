const fs = require('fs');
const path = require('path');

// --- 設定
const POSTAL_CODE = process.env.POSTAL_CODE || '285-0845';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 1000 * 60 * 2); // 2分
const STATE_FILE = path.join(__dirname, 'stock-state.json');

if (!DISCORD_WEBHOOK_URL) {
  console.error('DISCORD_WEBHOOK_URL を環境変数で指定してください。');
  process.exit(1);
}

// 監視する製品（部品番号）
const products = [
  { model: 'iPhone 17 Pro 256GB ブラックチタニウム', part: 'MG854J/A' },
  { model: 'iPhone 17 Pro 256GB ナチュラルチタニウム', part: 'MG864J/A' },
  { model: 'iPhone 17 Pro 256GB ホワイトチタニウム', part: 'MG874J/A' },
  { model: 'iPhone 17 Pro Max 256GB ブラックチタニウム', part: 'MFY84J/A' },
  { model: 'iPhone 17 Pro Max 256GB ナチュラルチタニウム', part: 'MFY94J/A' },
  { model: 'iPhone 17 Pro Max 256GB ホワイトチタニウム', part: 'MFYA4J/A' },
];

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function notifyDiscord(message) {
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord通知失敗 ${res.status}: ${text}`);
  }
}

// Apple Store 店舗受け取り在庫 API
async function fetchStoreAvailability(parts) {
  const paramsBase = `pl=true&mts.0=regular&mts.1=pickup&location=${encodeURIComponent(POSTAL_CODE)}`;
  const partsParams = parts.map((p, i) => `parts.${i}=${encodeURIComponent(p)}`).join('&');
  const url = `https://www.apple.com/jp/shop/fulfillment-messages?${paramsBase}&${partsParams}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function parseAvailability(data, part) {
  const stores = data?.body?.content?.pickupMessage?.stores ?? [];
  const availableStores = [];

  for (const store of stores) {
    const item = store?.parts?.[part];
    if (!item) continue;
    const display = (item.pickupDisplay || '').toLowerCase();
    const quote = (item.pickupSearchQuote || '').toLowerCase();
    if (
      display === 'available' ||
      quote.includes('available') ||
      display.includes('在庫あり')
    ) {
      availableStores.push(store.storeName || store.storeNumber || '不明');
    }
  }

  return availableStores;
}

async function checkAll() {
  console.log(new Date().toISOString(), `checking stock... (郵便番号: ${POSTAL_CODE})`);
  const state = loadState();
  const parts = products.map((p) => p.part);

  let data;
  try {
    data = await fetchStoreAvailability(parts);
  } catch (err) {
    console.warn('API呼び出し失敗:', err.message);
    return;
  }

  for (const product of products) {
    try {
      const availableStores = parseAvailability(data, product.part);
      const inStock = availableStores.length > 0;
      const prev = Boolean(state[product.part]);
      state[product.part] = inStock;

      if (inStock && !prev) {
        const storeList = availableStores.slice(0, 5).join('\n  - ');
        const msg =
          `🎉 **在庫あり！** ${product.model}\n` +
          `📍 郵便番号: ${POSTAL_CODE}\n` +
          `🏪 受け取り可能店舗:\n  - ${storeList}\n` +
          `🔗 https://www.apple.com/jp/shop/product/${product.part}`;
        await notifyDiscord(msg);
        console.log('✅ 通知送信:', product.model);
      } else if (!inStock && prev) {
        console.log('❌ 在庫切れ:', product.model);
      } else {
        console.log(product.model, inStock ? '在庫あり' : '在庫なし');
      }
    } catch (err) {
      console.warn('処理失敗:', product.model, err.message);
    }
  }

  saveState(state);
}

(async () => {
  console.log(`iPhone在庫監視ツール起動 (郵便番号: ${POSTAL_CODE}, チェック間隔: ${CHECK_INTERVAL_MS / 1000}秒)`);
  await checkAll();
  setInterval(checkAll, CHECK_INTERVAL_MS);
})();
