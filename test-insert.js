const { Client } = require('pg');
const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' 
});
client.connect().then(() => {
  return client.query('ALTER TABLE locations DISABLE ROW LEVEL SECURITY');
}).then(() => {
  return client.query('INSERT INTO locations (name, slug, category_id, pricing_type, country_id, state_id, city_id, is_published) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', 
    ['Test Location', 'test-location', '07fb4663-8ee7-4d6b-93a8-db498f619052', 'free', 'a908dfa0-efa9-47f9-8129-1a0b54e8b4f8', '436d121f-9739-453c-a791-d54280df929f', '1f43b173-3929-472c-9dd3-16d4c7a5ade0', true]);
}).then(r => {
  console.log('Inserted:', r.rows);
  return client.query('SELECT * FROM locations WHERE slug = $1', ['test-location']);
}).then(r => {
  console.log('Select:', r.rows);
  return client.query('ALTER TABLE locations ENABLE ROW LEVEL SECURITY');
}).then(() => {
  return client.end();
}).catch(e => console.error('Error:', e.message, e.detail, e.hint));