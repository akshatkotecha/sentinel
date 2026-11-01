// BEHAVIOUR ENGINE (Express, port 3002)
// Stores each developer's Git activity and turns it into metrics.
// The dashboard's rankings and Flask's alerts both read from this server.
const express = require('express');
const cors = require('cors');
const { db, run, route } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Turns one row of raw Git activity into the numbers the rest of the app uses.
// These are calculated on each request instead of being stored, so staleness
// is always measured against the current time.
function computeMetrics(row, taskStatus = 'todo') {
  const now = Date.now();
  // Hours since the last commit. getTime() gives milliseconds, so divide down to hours.
  const hoursInactive = row.last_commit ? (now - new Date(row.last_commit).getTime()) / (1000 * 60 * 60) : 0;
  // Share of file edits that were not reverted. Math.max avoids dividing by zero.
  const accuracy = 1 - (row.file_edits_reverts / Math.max(1, row.file_edits_total));

  return {
    // activity: commits divided by 24. staleness: hours since the last commit.
    // speed: commits per hour of inactivity. accuracy: calculated above.
    // mismatch: the task says in progress, but there is no commit for over 4 hours.
    // riskScore: longer inactivity and more reverts both raise it.
    activity: row.commits / 24,
    staleness: Math.max(0, hoursInactive),
    speed: row.commits / Math.max(1, hoursInactive),
    accuracy,
    mismatch: taskStatus === 'in_progress' && hoursInactive > 4 ? 'HIGH_RISK' : 'OK',
    riskScore: (hoursInactive > 8 ? 3 : hoursInactive > 4 ? 2 : 1) * (1 - accuracy)
  };
}

// Derived activity, staleness, speed, accuracy and risk for one user.
app.get('/behavior/:userId', route(async (req, res) => {
  const row = await run(db.from('behavior').select('*').eq('user_id', req.params.userId).maybeSingle());
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json(computeMetrics(row, req.query.taskStatus));
}));

// Ingests a Git activity update (commits, file edits, commit timestamps) for
// one user. Only the fields present in the body are overwritten.
app.post('/git/update/:userId', route(async (req, res) => {
  const { userId } = req.params;
  const { commits, fileEdits, timestamps } = req.body;

  // Make sure the user exists first, because behavior.user_id must point to a real
  // user. ignoreDuplicates leaves an existing user's name and skills untouched.
  await run(db.from('users').upsert({ id: userId, name: userId }, { onConflict: 'id', ignoreDuplicates: true }));

  const row = {
    user_id: userId,
    last_commit: new Date(timestamps?.[0] || Date.now()).toISOString(),
    updated_at: new Date().toISOString()
  };
  if (commits !== undefined) row.commits = commits;
  if (fileEdits) {
    row.file_edits_total = fileEdits.total;
    row.file_edits_reverts = fileEdits.reverts;
  }
  // One behaviour row per user: insert it the first time, update it after that.
  await run(db.from('behavior').upsert(row, { onConflict: 'user_id' }));
  res.json({ updated: true });
}));

// Everyone on the team with their metrics, for the console's rankings.
app.get('/team', route(async (req, res) => {
  // behavior(*) tells Supabase to include each user's linked behaviour row, which
  // works because of the foreign key between the two tables.
  const users = await run(db.from('users').select('id, name, role, skills, behavior(*)'));
  const team = users.map(({ behavior, ...user }) => {
    // Users with no activity yet get zeros, so they still appear in the rankings.
    const row = behavior || { commits: 0, last_commit: null, file_edits_total: 0, file_edits_reverts: 0 };
    return { ...user, commits: row.commits, hasActivity: Boolean(behavior), ...computeMetrics(row) };
  });
  res.json(team.sort((a, b) => b.commits - a.commits));
}));

// Not used by the dashboard, which ranks by commits using /team instead.
// Ranks users by a blend of commit volume, recency and edit accuracy.
app.get('/leaderboard', route(async (req, res) => {
  const rows = await run(db.from('behavior').select('*'));
  const scores = rows.map((data) => {
    const hoursInactive = data.last_commit ? (Date.now() - new Date(data.last_commit).getTime()) / (1000 * 60 * 60) : 24;
    return {
      userId: data.user_id,
      score: data.commits * 0.4 + (1 / (1 + hoursInactive)) * 0.3 + (1 - (data.file_edits_reverts / Math.max(1, data.file_edits_total))) * 0.3
    };
  }).sort((a, b) => b.score - a.score);
  res.json(scores.slice(0, 5));
}));

app.get('/', (req, res) => {
  res.send('Sentinel Behaviour Engine API Running');
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'BEHAVIOUR ENGINE LIVE', port: 3002 }));

app.get('/info', (req, res) => {
  res.json({
    service: "Sentinel Behaviour Engine",
    version: "1.0",
    endpoints: [
      "/health",
      "/team",
      "/git/update/user1",
      "/behavior/user1"
    ]
  });
});

// Starts the server and keeps it waiting for requests.
app.listen(3002, () => {
  console.log('🚀 Sentinel Behaviour Engine: http://localhost:3002');
  console.log('📡 POST /git/update/user1');
  console.log('📊 GET  /behavior/user1?taskStatus=in_progress');
});
