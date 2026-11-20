const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' 
});

const fields = [
  { field_name: 'pre_wedding_shoot', description: 'Whether pre-wedding shoots are allowed, conditional, or prohibited at this location.', ai_guidance: 'Check official venue website, ASI notifications, or state tourism portals for current pre-wedding shoot policy. Value must be one of: allowed, conditional, prohibited.', sensitivity: 'sensitive', min_confidence: 0.8, pair_group: 'shoot_permissions', is_active: true },
  { field_name: 'prior_booking', description: 'Whether advance booking is required for shoots at this location.', ai_guidance: 'Check official venue website or contact the managing authority. Answer should describe booking requirements clearly.', sensitivity: 'normal', min_confidence: 0.7, pair_group: 'shoot_permissions', is_active: true },
  { field_name: 'drone_status', description: 'Whether drone flights are allowed, conditional, or prohibited at this location.', ai_guidance: 'Check DGCA regulations, ASI notifications, local police orders, and venue-specific rules. Value must be one of: allowed, conditional, prohibited.', sensitivity: 'sensitive', min_confidence: 0.8, pair_group: 'drone_policy', is_active: true },
  { field_name: 'drone_permission', description: 'Details about required drone permissions, restrictions, and relevant authority.', ai_guidance: 'If drone_status is conditional or prohibited, identify the specific permission needed, the issuing authority (DGCA, ASI, local admin, venue management), and any restrictions (height, time, no-fly zones).', sensitivity: 'sensitive', min_confidence: 0.7, pair_group: 'drone_policy', is_active: true },
  { field_name: 'entry_fee', description: 'General entry fee for visitors (INR).', ai_guidance: 'Find the current entry fee for Indian nationals from official sources (ASI, state tourism, venue website). Always use INR (₹). Distinguish from photography fees. If unknown, state unknown - never assume ₹0.', sensitivity: 'normal', min_confidence: 0.7, pair_group: 'pricing', is_active: true },
  { field_name: 'shoot_permit_fee', description: 'Professional/pre-wedding photoshoot permit fee (INR), separate from general entry fee.', ai_guidance: 'Find the professional photography/pre-wedding shoot permit fee from official sources. This is separate from general entry fee. If unknown, state unknown - never assume ₹0. If free, explicitly state "Free".', sensitivity: 'sensitive', min_confidence: 0.8, pair_group: 'pricing', is_active: true }
];

async function upsertFields() {
  try {
    await client.connect();
    console.log('Connected to ai_validate');
    
    for (const f of fields) {
      await client.query(`
        INSERT INTO ai_verifiable_location_fields (field_name, description, ai_guidance, sensitivity, min_confidence, pair_group, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (field_name) DO UPDATE SET
          description = EXCLUDED.description,
          ai_guidance = EXCLUDED.ai_guidance,
          sensitivity = EXCLUDED.sensitivity,
          min_confidence = EXCLUDED.min_confidence,
          pair_group = EXCLUDED.pair_group,
          is_active = EXCLUDED.is_active
      `, [f.field_name, f.description, f.ai_guidance, f.sensitivity, f.min_confidence, f.pair_group, f.is_active]);
      console.log('Upserted:', f.field_name);
    }
    
    const result = await client.query('SELECT field_name, description, sensitivity, pair_group FROM ai_verifiable_location_fields WHERE is_active = true ORDER BY field_name');
    console.log('\nActive verifiable fields:');
    console.table(result.rows);
    
    await client.end();
  } catch (e) {
    console.error('Error:', e.message, e.detail, e.hint);
    await client.end();
  }
}

upsertFields();