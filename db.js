require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example)');
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Unwraps a Supabase response, turning its returned error into a thrown one.
async function run(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Express 4 doesn't catch rejected async handlers on its own.
const route = (handler) => (req, res) =>
  handler(req, res).catch((err) => res.status(500).json({ error: err.message }));

module.exports = { db, run, route };
