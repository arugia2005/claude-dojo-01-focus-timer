const puppeteer = require('puppeteer');

const MANABA_BASE = 'https://manaba.chuo-u.ac.jp';
const LOGIN_URL = `${MANABA_BASE}/ct/login`;

async function scrapeManaba(manabaId, manabaPass, settings) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    // ログイン
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.type('input[name="username"]', manabaId);
    await page.type('input[name="password"]', manabaPass);
    await Promise.all([
      page.click('input[type="submit"], button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    ]);

    if (page.url().includes('login')) {
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

  return page.evaluate(
    (label, MANABA_BASE) => {
      const results = [];
      // まなばのコンテンツリスト行を探す（複数セレクタ対応）
      const rows = document.querySelectorAll(
        'table.contentslist tr, .contents-row, tr.row'
      );

      for (const row of rows) {
        const titleEl =
          row.querySelector('td.title a, .contents-title a, td:nth-child(2) a');
        const deadlineEl =
          row.querySelector('td.deadline, .contents-deadline, td:nth-child(4)');
        const courseEl =
          row.querySelector('td.course, .contents-course, td:nth-child(1)');

        if (!titleEl || !deadlineEl) continue;

        const deadlineText = deadlineEl.textContent.trim();
        // 期限なし or ハイフンのみはスキップ
        if (!deadlineText || deadlineText === '-' || deadlineText === '') continue;

        // 期限切れはスキップ（行にexpiredクラスがある場合）
        if (row.classList.contains('expired') || row.classList.contains('deadline-passed')) continue;

        const href = titleEl.getAttribute('href') || '';
        const fullUrl = href.startsWith('http') ? href : MANABA_BASE + href;

        results.push({
          type: label,
          title: titleEl.textContent.trim(),
          course: courseEl ? courseEl.textContent.trim() : '不明',
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

// "2026年04月20日 23:59" などをDateに変換
function parseJapaneseDate(str) {
  const m = str.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return new Date(
    `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:00+09:00`
  );
}

module.exports = { scrapeManaba, parseJapaneseDate };
