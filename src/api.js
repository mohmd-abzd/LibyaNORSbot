const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db/pool');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── GET /api/reports ─────────────────────────────────────────────────────────
// Optional query params: district, symptom, status, days (default 7)
app.get('/api/reports', async (req, res) => {
  const { district, symptom, status, days = 7 } = req.query;

  const conditions = [`submitted_at > NOW() - INTERVAL '${parseInt(days)} days'`];
  const params = [];

  if (district) {
    params.push(district);
    conditions.push(`LOWER(district) = LOWER($${params.length})`);
  }
  if (symptom) {
    params.push(symptom);
    conditions.push(`symptom_type = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT
       id, reporter_role, district, neighborhood,
       ST_Y(location::geometry) AS lat,
       ST_X(location::geometry) AS lng,
       age_group, affected_count, symptom_type, onset,
       observation, status, escalation_level, submitted_at
     FROM reports
     ${where}
     ORDER BY submitted_at DESC
     LIMIT 200`,
    params
  );

  res.json(result.rows);
});

// ── GET /api/stats ───────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const { days = 7 } = req.query;
  const d = parseInt(days);

  const [totals, bySymptom, byDistrict, byDay] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'new') AS pending,
         COUNT(*) FILTER (WHERE status = 'escalated') AS escalated
       FROM reports WHERE submitted_at > NOW() - INTERVAL '${d} days'`
    ),
    pool.query(
      `SELECT symptom_type, COUNT(*) AS count
       FROM reports WHERE submitted_at > NOW() - INTERVAL '${d} days'
       GROUP BY symptom_type ORDER BY count DESC`
    ),
    pool.query(
      `SELECT district, COUNT(*) AS count
       FROM reports WHERE submitted_at > NOW() - INTERVAL '${d} days'
         AND district IS NOT NULL
       GROUP BY district ORDER BY count DESC LIMIT 10`
    ),
    pool.query(
      `SELECT DATE(submitted_at) AS date, COUNT(*) AS count
       FROM reports WHERE submitted_at > NOW() - INTERVAL '${d} days'
       GROUP BY DATE(submitted_at) ORDER BY date`
    ),
  ]);

  res.json({
    totals: totals.rows[0],
    bySymptom: bySymptom.rows,
    byDistrict: byDistrict.rows,
    byDay: byDay.rows,
  });
});

// ── GET /api/alerts ──────────────────────────────────────────────────────────
// Districts with 3+ reports in last 48h (simple threshold)
app.get('/api/alerts', async (req, res) => {
  const result = await pool.query(
    `SELECT
       district,
       symptom_type,
       COUNT(*) AS report_count,
       SUM(CASE affected_count
         WHEN '1'   THEN 1
         WHEN '2-5' THEN 3
         WHEN '6-10' THEN 8
         WHEN '10+' THEN 15
         ELSE 1
       END) AS estimated_cases,
       MIN(submitted_at) AS first_report,
       MAX(submitted_at) AS last_report
     FROM reports
     WHERE submitted_at > NOW() - INTERVAL '48 hours'
       AND district IS NOT NULL
     GROUP BY district, symptom_type
     HAVING COUNT(*) >= 3
     ORDER BY report_count DESC`
  );

  res.json(result.rows);
});

// ── PATCH /api/reports/:id/status ────────────────────────────────────────────
app.patch('/api/reports/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, escalation_level } = req.body;

  await pool.query(
    `UPDATE reports SET
       status = COALESCE($1, status),
       escalation_level = COALESCE($2, escalation_level),
       reviewed_at = NOW()
     WHERE id = $3`,
    [status, escalation_level, id]
  );

  res.json({ ok: true });
});

// ── GET /api/cluster ─────────────────────────────────────────────────────────
// PostGIS: reports within radius_km of a point (for future hotspot use)
app.get('/api/cluster', async (req, res) => {
  const { lat, lng, radius_km = 10, days = 7 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const result = await pool.query(
    `SELECT
       id, district, symptom_type, affected_count, submitted_at,
       ST_Distance(
         location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       ) / 1000 AS distance_km
     FROM reports
     WHERE location IS NOT NULL
       AND submitted_at > NOW() - INTERVAL '${parseInt(days)} days'
       AND ST_DWithin(
         location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
     ORDER BY distance_km`,
    [parseFloat(lng), parseFloat(lat), parseFloat(radius_km) * 1000]
  );

  res.json(result.rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API + dashboard running on http://localhost:${PORT}`));

module.exports = app;
