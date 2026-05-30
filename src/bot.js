const TelegramBot = require('node-telegram-bot-api');
const pool = require('./db/pool');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// In-memory session store (swap for Redis in production)
const sessions = new Map();

// ── Question definitions ────────────────────────────────────────────────────

const STEPS = {
  START: 'start',
  Q1_ROLE: 'q1_role',
  Q2_DISTRICT: 'q2_district',
  Q2_NEIGHBORHOOD: 'q2_neighborhood',
  Q2_GPS: 'q2_gps',
  Q3_AGE: 'q3_age',
  Q4_COUNT: 'q4_count',
  Q5_SYMPTOM: 'q5_symptom',
  Q6_ONSET: 'q6_onset',
  Q7_OBSERVATION: 'q7_observation',
  DONE: 'done',
};

function newSession() {
  return {
    step: STEPS.START,
    data: {},
  };
}

function getSession(chatId) {
  if (!sessions.has(chatId)) sessions.set(chatId, newSession());
  return sessions.get(chatId);
}

// ── Keyboard helpers ────────────────────────────────────────────────────────

function keyboard(buttons) {
  return {
    reply_markup: {
      keyboard: buttons.map((row) =>
        Array.isArray(row) ? row.map((t) => ({ text: t })) : [{ text: row }]
      ),
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  };
}

function removeKeyboard() {
  return { reply_markup: { remove_keyboard: true } };
}

// ── Step handlers ───────────────────────────────────────────────────────────

async function askQ1(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q1_ROLE;
  await bot.sendMessage(
    chatId,
    '👤 *Who are you reporting for?*',
    {
      parse_mode: 'Markdown',
      ...keyboard([
        ['🙋 Myself', '👤 Someone else'],
        ['👥 A group / community', '🏥 I am a health/community worker'],
      ]),
    }
  );
}

async function askQ2District(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q2_DISTRICT;
  await bot.sendMessage(
    chatId,
    '📍 *Where is the case or event?*\n\nType the district or municipality name:',
    { parse_mode: 'Markdown', ...removeKeyboard() }
  );
}

async function askQ2Neighborhood(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q2_NEIGHBORHOOD;
  await bot.sendMessage(
    chatId,
    '🏘️ Neighborhood? _(optional — type it or tap Skip)_',
    {
      parse_mode: 'Markdown',
      ...keyboard([['⏭️ Skip']]),
    }
  );
}

async function askQ2GPS(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q2_GPS;
  await bot.sendMessage(
    chatId,
    '📡 Share your GPS location? _(optional — helps pinpoint the area)_',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '📍 Share my location', request_location: true }],
          [{ text: '⏭️ Skip' }],
        ],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    }
  );
}

async function askQ3(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q3_AGE;
  await bot.sendMessage(
    chatId,
    '👶🧑👴 *Age group of those affected:*',
    {
      parse_mode: 'Markdown',
      ...keyboard([
        ['🧒 Child (under 15)', '🧑 Adult'],
        ['👴 Elderly (65+)', '👨‍👩‍👧 Mixed group'],
        ['❓ Unknown'],
      ]),
    }
  );
}

async function askQ4(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q4_COUNT;
  await bot.sendMessage(
    chatId,
    '🔢 *How many people are affected?*',
    {
      parse_mode: 'Markdown',
      ...keyboard([
        ['1️⃣ 1 person', '2️⃣ 2–5 people'],
        ['3️⃣ 6–10 people', '4️⃣ More than 10'],
        ['❓ Unknown'],
      ]),
    }
  );
}

async function askQ5(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q5_SYMPTOM;
  await bot.sendMessage(
    chatId,
    '🤒 *Main symptoms or event type:*',
    {
      parse_mode: 'Markdown',
      ...keyboard([
        ['🌡️ Fever', '🤢 Diarrhea / vomiting'],
        ['😮‍💨 Respiratory symptoms', '🔴 Rash / skin issue'],
        ['💀 Unusual death', '🐾 Animal-related event'],
        ['❓ Other'],
      ]),
    }
  );
}

async function askQ6(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q6_ONSET;
  await bot.sendMessage(
    chatId,
    '📅 *When did it start?*',
    {
      parse_mode: 'Markdown',
      ...keyboard([
        ['Today', 'Yesterday'],
        ['2–3 days ago', 'More than 3 days ago'],
        ['Not sure'],
      ]),
    }
  );
}

async function askQ7(chatId) {
  const session = getSession(chatId);
  session.step = STEPS.Q7_OBSERVATION;
  await bot.sendMessage(
    chatId,
    '📝 *Please describe what you observed.*\n\nInclude: illness details, time period, location specifics, and any other important information.',
    { parse_mode: 'Markdown', ...removeKeyboard() }
  );
}

// ── Save report ─────────────────────────────────────────────────────────────

async function saveReport(chatId, session) {
  const d = session.data;

  const roleMap = {
    '🙋 Myself': 'myself',
    '👤 Someone else': 'someone_else',
    '👥 A group / community': 'group',
    '🏥 I am a health/community worker': 'health_worker',
  };

  const ageMap = {
    '🧒 Child (under 15)': 'child',
    '🧑 Adult': 'adult',
    '👴 Elderly (65+)': 'elderly',
    '👨‍👩‍👧 Mixed group': 'mixed',
    '❓ Unknown': 'unknown',
  };

  const countMap = {
    '1️⃣ 1 person': '1',
    '2️⃣ 2–5 people': '2-5',
    '3️⃣ 6–10 people': '6-10',
    '4️⃣ More than 10': '10+',
    '❓ Unknown': 'unknown',
  };

  const symptomMap = {
    '🌡️ Fever': 'fever',
    '🤢 Diarrhea / vomiting': 'diarrhea',
    '😮‍💨 Respiratory symptoms': 'respiratory',
    '🔴 Rash / skin issue': 'rash',
    '💀 Unusual death': 'death',
    '🐾 Animal-related event': 'animal',
    '❓ Other': 'other',
  };

  const onsetMap = {
    'Today': 'today',
    'Yesterday': 'yesterday',
    '2–3 days ago': '2-3_days',
    'More than 3 days ago': '3+_days',
    'Not sure': 'unknown',
  };

  const locationSQL = d.gps
    ? `ST_SetSRID(ST_MakePoint(${d.gps.longitude}, ${d.gps.latitude}), 4326)`
    : null;

  await pool.query(
    `INSERT INTO reports
      (telegram_id, reporter_role, district, neighborhood, location,
       age_group, affected_count, symptom_type, onset, observation)
     VALUES ($1,$2,$3,$4,${locationSQL ? locationSQL : 'NULL'},$5,$6,$7,$8,$9)`,
    [
      chatId,
      roleMap[d.role] || d.role,
      d.district,
      d.neighborhood,
      ageMap[d.age_group] || d.age_group,
      countMap[d.count] || d.count,
      symptomMap[d.symptom] || d.symptom,
      onsetMap[d.onset] || d.onset,
      d.observation,
    ]
  );

  // Upsert reporter
  await pool.query(
    `INSERT INTO reporters (telegram_id) VALUES ($1)
     ON CONFLICT (telegram_id) DO NOTHING`,
    [chatId]
  );
}

// ── Alert check ─────────────────────────────────────────────────────────────

async function checkAndAlert(chatId, session) {
  const district = session.data.district;
  if (!district) return;

  const result = await pool.query(
    `SELECT COUNT(*) as cnt FROM reports
     WHERE LOWER(district) = LOWER($1)
       AND submitted_at > NOW() - INTERVAL '48 hours'`,
    [district]
  );

  const count = parseInt(result.rows[0].cnt, 10);
  if (count >= 3) {
    // In production: send to surveillance team channel/webhook
    console.log(`⚠️  ALERT: ${count} reports from "${district}" in last 48h`);
  }
}

// ── Message router ──────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  sessions.set(chatId, newSession());
  await bot.sendMessage(
    chatId,
    `🏥 *Outbreak Early Warning System*\n\nThank you for helping protect your community.\n\nThis report takes about *1 minute*. Your information is confidential.\n\nType /report to submit a new report.\nType /status to check recent reports in your area.`,
    { parse_mode: 'Markdown', ...removeKeyboard() }
  );
});

bot.onText(/\/report/, async (msg) => {
  const chatId = msg.chat.id;
  sessions.set(chatId, newSession());
  await askQ1(chatId);
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const result = await pool.query(
    `SELECT district, symptom_type, COUNT(*) as cnt
     FROM reports
     WHERE submitted_at > NOW() - INTERVAL '7 days'
     GROUP BY district, symptom_type
     ORDER BY cnt DESC
     LIMIT 5`
  );

  if (result.rows.length === 0) {
    return bot.sendMessage(chatId, 'No recent reports in the last 7 days.');
  }

  const lines = result.rows
    .map((r) => `• ${r.district} — ${r.symptom_type}: ${r.cnt} report(s)`)
    .join('\n');

  await bot.sendMessage(chatId, `📊 *Last 7 days (top signals):*\n\n${lines}`, {
    parse_mode: 'Markdown',
  });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  // Skip commands
  if (msg.text && msg.text.startsWith('/')) return;

  const text = msg.text || '';

  try {
    switch (session.step) {
      case STEPS.Q1_ROLE:
        session.data.role = text;
        await askQ2District(chatId);
        break;

      case STEPS.Q2_DISTRICT:
        session.data.district = text;
        await askQ2Neighborhood(chatId);
        break;

      case STEPS.Q2_NEIGHBORHOOD:
        session.data.neighborhood = text === '⏭️ Skip' ? null : text;
        await askQ2GPS(chatId);
        break;

      case STEPS.Q2_GPS:
        if (msg.location) {
          session.data.gps = { latitude: msg.location.latitude, longitude: msg.location.longitude };
        }
        await askQ3(chatId);
        break;

      case STEPS.Q3_AGE:
        session.data.age_group = text;
        await askQ4(chatId);
        break;

      case STEPS.Q4_COUNT:
        session.data.count = text;
        await askQ5(chatId);
        break;

      case STEPS.Q5_SYMPTOM:
        session.data.symptom = text;
        await askQ6(chatId);
        break;

      case STEPS.Q6_ONSET:
        session.data.onset = text;
        await askQ7(chatId);
        break;

      case STEPS.Q7_OBSERVATION:
        session.data.observation = text;
        session.step = STEPS.DONE;

        await saveReport(chatId, session);
        await checkAndAlert(chatId, session);

        await bot.sendMessage(
          chatId,
          `✅ *Report received. Thank you.*\n\nYour report has been submitted to the surveillance team. If there are follow-up questions, a health officer may contact you.\n\nType /report to submit another report.`,
          { parse_mode: 'Markdown', ...removeKeyboard() }
        );
        sessions.delete(chatId);
        break;

      default:
        await bot.sendMessage(chatId, 'Type /report to start a new report.');
    }
  } catch (err) {
    console.error('Bot error:', err);
    await bot.sendMessage(chatId, '⚠️ Something went wrong. Please try again with /report.');
    sessions.delete(chatId);
  }
});

console.log('🤖 Telegram bot started');
module.exports = bot;
