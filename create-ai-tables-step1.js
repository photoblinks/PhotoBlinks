const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' 
});

async function createTables() {
  try {
    await client.connect();
    console.log('Connected to ai_validate database');
    
    // Create tables one by one
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_verifiable_location_fields (
        field_code text PRIMARY KEY,
        field_label text NOT NULL,
        field_group text,
        field_type text NOT NULL,
        valid_values text[],
        description text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('Created ai_verifiable_location_fields');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_maintenance_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_date date NOT NULL,
        status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        started_at timestamptz,
        completed_at timestamptz,
        total_locations integer NOT NULL DEFAULT 0,
        processed_locations integer NOT NULL DEFAULT 0,
        total_cost_usd numeric NOT NULL DEFAULT 0,
        total_tokens integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('Created ai_maintenance_runs');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_location_verification_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        run_id uuid NOT NULL REFERENCES ai_maintenance_runs(id) ON DELETE CASCADE,
        result text NOT NULL CHECK (result IN ('verified_ok', 'changes_found', 'failed')),
        confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        summary text,
        source_urls text[],
        model text NOT NULL,
        input_tokens integer,
        output_tokens integer,
        grounding_queries integer,
        estimated_cost_usd numeric,
        estimated_cost_inr numeric,
        execution_time_ms integer,
        is_latest boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('Created ai_location_verification_history');
    
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_location_verification_history_latest
        ON ai_location_verification_history (location_id) WHERE is_latest = true
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS ai_location_verification_history_location
        ON ai_location_verification_history (location_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS ai_location_verification_history_run
        ON ai_location_verification_history (run_id)
    `);
    console.log('Created indexes');
    
    await client.end();
    console.log('Done creating tables');
  } catch (e) {
    console.error('Error:', e.message, e.detail, e.hint);
    await client.end();
  }
}

createTables();