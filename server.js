const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'behavior.json');

// Seed data so the endpoints below have something to compute against on a
// fresh checkout, before any real Git activity has been posted in.
let behaviorData = {
  users: {
    'user1': { commits: 5, lastCommit: Date.now() - 2*60*60*1000, fileEdits: { total: 10, reverts: 1 } },
    'user2': { commits: 2, lastCommit: Date.now() - 10*60*60*1000, fileEdits: { total: 5, reverts: 2 } }
  }
};

// Save/load data
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(behaviorData, null, 2)); }
function loadData() {
  if (fs.existsSync(DATA_FILE)) behaviorData = JSON.parse(fs.readFileSync(DATA_FILE));
}
loadData();

function computeMetrics(userId, taskStatus = 'todo') {
  const user = behaviorData.users[userId];
  if (!user) return { error: 'User not found' };

  const now = Date.now();
  const hoursInactive = (now - user.lastCommit) / (1000 * 60 * 60);

  return {
    activity: user.commits / 24,
    staleness: Math.max(0, hoursInactive),
    speed: user.commits / Math.max(1, hoursInactive),
    accuracy: 1 - (user.fileEdits.reverts / Math.max(1, user.fileEdits.total)),
    mismatch: taskStatus === 'in_progress' && hoursInactive > 4 ? 'HIGH_RISK' : 'OK',
    riskScore: (hoursInactive > 8 ? 3 : hoursInactive > 4 ? 2 : 1) * (1 - user.accuracy)
  };
}

// Derived activity, staleness, speed, accuracy and risk for one user.
app.get('/behavior/:userId', (req, res) => {
  const metrics = computeMetrics(req.params.userId, req.query.taskStatus);
  res.json(metrics);
});

// Ingests a Git activity update (commits, file edits, commit timestamps) for
// one user and persists it to behavior.json.
app.post('/git/update/:userId', (req, res) => {
  const { userId } = req.params;
  behaviorData.users[userId] = {
    ...behaviorData.users[userId],
    ...req.body,
    lastCommit: req.body.timestamps?.[0] || Date.now()
  };
  saveData();
  res.json({ updated: true });
});

// Ranks users by a blend of commit volume, recency and edit accuracy.
app.get('/leaderboard', (req, res) => {
  const scores = Object.entries(behaviorData.users).map(([userId, data]) => ({
    userId,
    score: data.commits * 0.4 + (1 / (1 + (data.lastCommit ? (Date.now() - data.lastCommit)/(1000*60*60) : 24))) * 0.3 + (data.fileEdits ? 1 - (data.fileEdits.reverts / Math.max(1, data.fileEdits.total)) : 0.8) * 0.3
  })).sort((a, b) => b.score - a.score);
  res.json(scores.slice(0, 5));
});
app.get('/', (req, res) => {
  res.send('Sentinel Behaviour Engine API Running');
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'BEHAVIOUR ENGINE LIVE', port: 3002 }));

app.listen(3002, () => {
  console.log('🚀 Sentinel Behaviour Engine: http://localhost:3002');
  console.log('📡 POST /git/update/user1');
  console.log('📊 GET  /behavior/user1?taskStatus=in_progress');
});

app.get('/info', (req, res) => {
  res.json({
    service: "Sentinel Behaviour Engine",
    version: "1.0",
    endpoints: [
      "/health",
      "/git/update/user1",
      "/behavior/user1"
    ]
  });
});
