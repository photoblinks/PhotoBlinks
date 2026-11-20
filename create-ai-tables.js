const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' 
});

const sql = `
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
);

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
);

CREATE TABLE IF NOT EXISTS ai_location_verification_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL,
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
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_location_verification_history_latest
  ON ai_location_verification_history (location_id) WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS ai_location_verification_history_location
  ON ai_location_verification_history (location_id);

CREATE INDEX IF NOT EXISTS ai_location_verification_history_run
  ON ai_location_verification_history (run_id);
`;

async function createTables() {
  try {
    await client.connect();
    console.log('Connected to ai_validate database');
    
    await client.query(sql);
    console.log('Tables created successfully');
    
    // Insert the 5 verifiable fields
    const fields = [
      { field_code: 'pre_wedding_shoot', field_label: 'Pre-Wedding Shoot', field_group: 'Shoot Details', field_type: 'enum', valid_values: ['allowed', 'conditional', 'prohibited'], description: 'Whether pre-wedding shoots are allowed, conditional, or prohibited at this location.' },
      { field_code: 'prior_booking', field_label: 'Prior Booking', field_group: 'Shoot Details', field_type: 'text', valid_values: [], description: 'Whether advance booking is required for shoots at this location.' },
      { field_code: 'drone_status', field_label: 'Drone Status', field_group: 'Shoot Details', field_type: 'enum', valid_values: ['allowed', 'conditional', 'prohibited'], description: 'Whether drone flights are allowed, conditional, or prohibited at this location.' },
      { field_code: 'drone_permission', field_label: 'Drone Permission', field_group: 'Shoot Details', field_type: 'text', valid_values: [], description: 'Details about required drone permissions, restrictions, and relevant authority.' },
      { field_code: 'entry_fee', field_label: 'Entry Fee', field_group: 'Pricing & Timing', field_type: 'currency_inr', valid_values: [], description: 'General entry fee for visitors (INR).' },
      { field_code: 'shoot_permit_fee', field_label: 'Professional Photoshoot Permit Fee', field_group: 'Pricing & Timing', field_type: 'currency_inr', valid_values: [], description: 'Professional/pre-wedding photoshoot permit fee (INR), separate from general entry fee.' }
    ];
    
    for (const f of fields) {
      await client.query(`
        INSERT INTO ai_verifiable_location_fields (field_code, field_label, field_group, field_type, valid_values, description)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (field_code) DO UPDATE SET
          field_label = EXCLUDED.field_label,
          field_group = EXCLUDED.field_group,
          field_type = EXCLUDED.field_type,
          valid_values = EXCLUDED.valid_values,
          description = EXCLUDED.description,
          updated_at = now()
      `, [f.field_code, f.field_label, f.field_group, f.field_type, f.valid_values, f.description]);
    }
    console.log('Inserted 6 verifiable fields');
    
    await client.end();
  } catch (e) {
    console.error('Error:', e.message, e.detail, e.hint);
    await client.end();
  }
}

createTables();