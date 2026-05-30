require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');

    await client.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reporters (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        telegram_username TEXT,
        reporter_type TEXT DEFAULT 'community', -- community | health_worker | school | municipality | volunteer
        registered_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        
        -- Q1: Who are you reporting for
        reporter_role TEXT,           -- myself | someone_else | group | health_worker
        
        -- Q2: Location
        district TEXT,
        neighborhood TEXT,
        location GEOGRAPHY(Point, 4326),  -- PostGIS point for spatial queries
        
        -- Q3: Age group
        age_group TEXT,               -- child | adult | elderly | mixed | unknown
        
        -- Q4: Number affected
        affected_count TEXT,          -- 1 | 2-5 | 6-10 | 10+ | unknown
        
        -- Q5: Symptoms
        symptom_type TEXT,            -- fever | diarrhea | respiratory | rash | death | animal | other
        
        -- Q6: Onset
        onset TEXT,                   -- today | yesterday | 2-3_days | 3+_days | unknown
        
        -- Q7: Free text
        observation TEXT,
        
        -- Metadata
        status TEXT DEFAULT 'new',    -- new | reviewed | escalated | closed
        escalation_level INTEGER DEFAULT 0,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        reviewed_by TEXT
      );
    `);

    // Spatial index for geo queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS reports_location_idx ON reports USING GIST(location);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS reports_submitted_at_idx ON reports(submitted_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS reports_district_idx ON reports(district);
    `);

    // View: aggregated signals per district per day (used by detection logic)
    await client.query(`
      CREATE OR REPLACE VIEW daily_district_signals AS
      SELECT
        district,
        symptom_type,
        DATE(submitted_at) AS report_date,
        COUNT(*) AS report_count,
        SUM(CASE affected_count
          WHEN '1'    THEN 1
          WHEN '2-5'  THEN 3
          WHEN '6-10' THEN 8
          WHEN '10+'  THEN 15
          ELSE 1
        END) AS estimated_cases
      FROM reports
      WHERE district IS NOT NULL
      GROUP BY district, symptom_type, DATE(submitted_at);
    `);

    console.log('✅ Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
