const puppeteer = require('puppeteer');

const MANABA_BASE = 'https://room.chuo-u.ac.jp';
const SAML_IDP_HOST = 'gakunin-idp.c.chuo-u.ac.jp';

async function scrapeManaba(manabaId, manabaPass, settings) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // まなばトップに飛ぶ → 学認SAMLにリダイレクトされる
    await page.goto(`${MANABA_BASE}/ct/home`, { waitUntil: 'networkidle2', timeout: 30000 });

    // 学認IdPのログインページであることを確認
    if (!page.url().includes(SAML_IDP_HOST)) {
      throw new Error(`予期しないリダイレクト先: ${page.url()}`);
    }

    // 学認IdPでログイン（フォームフィールド名を確認して入力）
    await page.waitForSelector('input[name="username"], input[name="j_username"]', { timeout: 10000 });
    const userField = await page.$('input[name="username"]') || await page.$('input[name="j_username"]');
    const passField = await page.$('input[name="password"]') || await page.$('input[name="j_password"]');

    await userField.type(manabaId);
    await passField.type(manabaPass);

    await Promise.all([
      page.click('input[type="submit"], button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    ]);

    // SAMLレスポンス処理のため追加リダイレクトを待つ
    if (page.url().includes(SAML_IDP_HOST) || page.url().includes('saml')) {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    }

    if (!page.url().includes('room.chuo-u.ac.jp')) {
      throw new Error('まなばへのログインに失敗しました。ID・パスワードを確認してください。');
    }

    const deadlines = [];

    if (settings.include_assignments) {
      const items = await scrapeContentList(page, 'query', '課題');
      deadlines.push(...items);
    }
    if (settings.include_quizzes) {
      const items = await scrapeContentList(page, 'small_test', '小テスト');
      deadlines.push(...items);
    }
    if (settings.include_announcements) {
      const items = await scrapeContentList(page, 'news', 'お知らせ');
      deadlines.push(...items);
    }
    if (settings.include_surveys) {
      const items = await scrapeContentList(page, 'survey', 'アンケート');
      deadlines.push(...items);
    }

    return deadlines;
  } finally {
    await browser.close();
  }
}

async function scrapeContentList(page, contentType, label) {
  const url = `${MANABA_BASE}/ct/home_library_${contentType}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // 動的ロードを待つ（stdlist に <td> が現れるまで最大15秒）
  await page.waitForFunction(
    () => document.querySelector('table.stdlist td') !== null,
    { timeout: 15000 }
  ).catch(() => {});

  // デバッグ：stdlist の実際のHTML（最初の2行分）を出力
  const debugHtml = await page.evaluate(() => {
    const t = document.querySelector('table.stdlist');
    if (!t) return 'table.stdlist が見つかりません';
    const rows = t.querySelectorAll('tr');
    return Array.from(rows).slice(0, 3).map(r => r.innerHTML.substring(0, 500)).join('\n---\n');
  });
  console.log(`[debug] ${contentType} stdlist HTML:\n`, debugHtml);

  return page.evaluate(
    (label, MANABA_BASE) => {
      const results = [];
      // table.stdlist が manaba の標準コンテンツテーブル
      const rows = document.querySelectorAll('table.stdlist tr');

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        // 列構造: タイプ | タイトル | コース | 受付開始 | 受付終了 [| 受付期間]
        if (cells.length < 5) continue;

        // cell[1] = タイトル（リンクあり）
        const titleEl = cells[1].querySelector('a');
        if (!titleEl) continue;

        // cell[4] = 受付終了日時（締切）例: "2026-04-22 13:20"
        const deadlineText = cells[4].textContent.trim();
        if (!/\d{4}-\d{2}-\d{2}/.test(deadlineText)) continue;

        // cell[2] = コース名
        const courseText = cells[2].textContent.trim();

        const href = titleEl.getAttribute('href') || '';
        const fullUrl = href.startsWith('http') ? href : MANABA_BASE + href;

        results.push({
          type: label,
          title: titleEl.textContent.trim(),
          course: courseText,
          deadline: deadlineText,
          url: fullUrl,
        });
      }
      return results;
    },
    label,
    MANABA_BASE
  );
}

// "2026-04-22 13:20" または "2026年04月20日 23:59" をDateに変換
function parseJapaneseDate(str) {
  // ISO形式: "2026-04-22 13:20"
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (iso) {
    return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:00+09:00`);
  }
  // 日本語形式: "2026年04月20日 23:59"
  const jp = str.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
  if (jp) {
    return new Date(
      `${jp[1]}-${jp[2].padStart(2, '0')}-${jp[3].padStart(2, '0')}T${jp[4].padStart(2, '0')}:${jp[5]}:00+09:00`
    );
  }
  return null;
}

module.exports = { scrapeManaba, parseJapaneseDate };
