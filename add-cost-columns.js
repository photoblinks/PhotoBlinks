const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' 
});

async function addCostColumns() {
  try {
    await client.connect();
    console.log('Connected to ai_validate');
    
    // Add cost tracking columns if they don't exist
    const columns = [
      { name: 'input_tokens', type: 'integer' },
      { name: 'output_tokens', type: 'integer' },
      { name: 'grounding_queries', type: 'integer' },
      { name: 'estimated_cost_usd', type: 'numeric' },
      { name: 'estimated_cost_inr', type: 'numeric' },
      { name: 'execution_time_ms', type: 'integer' }
    ];
    
    for (const col of columns) {
      try {
        await client.query(`ALTER TABLE ai_location_verification_history ADD COLUMN ${col.name} ${col.type}`);
        console.log(`Added column: ${col.name}`);
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`Column ${col.name} already exists`);
        } else {
          console.error(`Error adding ${col.name}:`, e.message);
        }
      }
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

addCostColumns();