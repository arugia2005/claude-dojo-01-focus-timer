const { google } = require('googleapis');

// 科目名 → Google CalendarカラーID（1-11）のハッシュマッピング
const COLOR_IDS = ['1','2','3','4','5','6','7','8','9','10','11'];
function getCourseColor(courseName) {
  let hash = 0;
  for (const ch of courseName) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return COLOR_IDS[Math.abs(hash) % COLOR_IDS.length];
}

function buildOAuthClient(accessToken, refreshToken) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return client;
}

async function addEvent(authClient, calendarId, item, deadlineDate) {
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  const end = deadlineDate;
  const start = new Date(end.getTime() - 60 * 60 * 1000); // 1時間前

  const event = {
    summary: `[${item.type}] ${item.title}`,
    description: `科目: ${item.course}\n${item.url}`,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Tokyo' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Tokyo' },
    colorId: getCourseColor(item.course),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 }, // 前日
        { method: 'popup', minutes: 60 },       // 1時間前
      ],
    },
  };

  const res = await calendar.events.insert({ calendarId, requestBody: event });
  return res.data.id;
}

module.exports = { buildOAuthClient, addEvent };
