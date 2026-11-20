const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' 
});

async function checkColumns() {
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'ai_maintenance_runs'
      ORDER BY ordinal_position
    `);
    console.table(result.rows);
    
    await client.end();
  } catch (e) {
    console.error('Error:', e.message, e.detail, e.hint);
    await client.end();
  }
}

checkColumns();