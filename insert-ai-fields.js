const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' 
});

const fields = [
  { field_code: 'pre_wedding_shoot', field_label: 'Pre-Wedding Shoot', field_group: 'Shoot Details', field_type: 'enum', valid_values: ['allowed', 'conditional', 'prohibited'], description: 'Whether pre-wedding shoots are allowed, conditional, or prohibited at this location.' },
  { field_code: 'prior_booking', field_label: 'Prior Booking', field_group: 'Shoot Details', field_type: 'text', valid_values: [], description: 'Whether advance booking is required for shoots at this location.' },
  { field_code: 'drone_status', field_label: 'Drone Status', field_group: 'Shoot Details', field_type: 'enum', valid_values: ['allowed', 'conditional', 'prohibited'], description: 'Whether drone flights are allowed, conditional, or prohibited at this location.' },
  { field_code: 'drone_permission', field_label: 'Drone Permission', field_group: 'Shoot Details', field_type: 'text', valid_values: [], description: 'Details about required drone permissions, restrictions, and relevant authority.' },
  { field_code: 'entry_fee', field_label: 'Entry Fee', field_group: 'Pricing & Timing', field_type: 'currency_inr', valid_values: [], description: 'General entry fee for visitors (INR).' },
  { field_code: 'shoot_permit_fee', field_label: 'Professional Photoshoot Permit Fee', field_group: 'Pricing & Timing', field_type: 'currency_inr', valid_values: [], description: 'Professional/pre-wedding photoshoot permit fee (INR), separate from general entry fee.' }
];

async function insertFields() {
  try {
    await client.connect();
    console.log('Connected to ai_validate database');
    
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
      console.log('Inserted:', f.field_code);
    }
    
    const result = await client.query('SELECT field_code, field_label, field_type FROM ai_verifiable_location_fields ORDER BY field_code');
    console.log('\nAll fields:');
    console.table(result.rows);
    
    await client.end();
  } catch (e) {
    console.error('Error:', e.message, e.detail, e.hint);
    await client.end();
  }
}

insertFields();