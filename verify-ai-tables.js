const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/ai_validate' 
});

async function verifyTables() {
  try {
    await client.connect();
    console.log('Connected to:', (await client.query('SELECT current_database()')).rows[0].current_database);
    
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'ai_%'
      ORDER BY table_name
    `);
    console.log('AI tables:', tables.rows);
    
    for (const t of tables.rows) {
      const cols = await client.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [t.table_name]);
      console.log(`\nColumns in ${t.table_name}:`);
      console.table(cols.rows);
    }
    
    await client.end();
  } catch (e) {
    console.error('Error:', e.message, e.detail, e.hint);
    await client.end();
  }
}

verifyTables();