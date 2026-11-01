// SHARED DATABASE HELPER: index.js and server.js both import this file, so the
// Supabase connection and error handling are written in one place.
// dotenv loads the values in .env, one folder up in the project root, into process.env.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');

// Read the settings, and stop at startup with a clear message if any are missing.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example)');
}

// The client used for every query. It holds the secret key, which is why this
// code runs on the server and never in the browser.
// The auth options are off because no user logs in to this connection.
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Unwraps a Supabase response, turning its returned error into a thrown one.
async function run(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Wraps a route handler so that any database error becomes a 500 JSON response.
// Express 4 doesn't catch rejected async handlers on its own.
const route = (handler) => (req, res) =>
  handler(req, res).catch((err) => res.status(500).json({ error: err.message }));

module.exports = { db, run, route };
