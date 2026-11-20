const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' 
});

async function fixFKConstraint() {
  try {
    await client.connect();
    console.log('Connected to ai_validate');
    
    // Check if FK constraint exists
    const checkResult = await client.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'ai_location_verification_history'::regclass 
      AND contype = 'f'
      AND conname LIKE '%location_id%'
    `);
    
    if (checkResult.rows.length > 0) {
      for (const row of checkResult.rows) {
        console.log(`Dropping FK constraint: ${row.conname}`);
        await client.query(`ALTER TABLE ai_location_verification_history DROP CONSTRAINT ${row.conname}`);
        console.log(`Dropped: ${row.conname}`);
      }
    } else {
      console.log('No FK constraint found on location_id');
    }
    
    // Verify columns
    const result = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'ai_location_verification_history'
      ORDER BY ordinal_position
    `);
    console.log('\nAll columns in ai_location_verification_history:');
    console.table(result.rows);
    
    await client.end();
  } catch (e) {
    console.error('Error:', e.message, e.detail, e.hint);
    await client.end();
  }
}

fixFKConstraint();