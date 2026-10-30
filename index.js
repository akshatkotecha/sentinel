const express = require('express');
const cors = require('cors');
const { db, run, route } = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

const SKILL_KEYWORDS = {
  frontend: ['ui', 'css', 'button', 'animation', 'frontend', 'react', 'dashboard'],
  backend: ['api', 'server', 'database', 'auth', 'backend', 'node'],
  ml: ['ai', 'model', 'train', 'ml', 'data', 'python']
};
const SKILL_TYPES = { frontend: 'Frontend', backend: 'Backend', ml: 'AI' };

function inferSkills(title) {
  const words = title.toLowerCase().match(/[a-z0-9]+/g) || [];
  return Object.keys(SKILL_KEYWORDS).filter(skill =>
    SKILL_KEYWORDS[skill].some(keyword => words.includes(keyword))
  );
}

async function loadCandidates() {
  const users = await run(db.from('users').select('id, name, role, skills'));
  const open = await run(db.from('tasks').select('assigned_to').neq('status', 'done').not('assigned_to', 'is', null));
  return users.map(user => ({
    ...user,
    currentTasks: open.filter(task => task.assigned_to === user.id).length
  }));
}

// Best candidate by skill match; ties go to whoever holds fewer open tasks.
// Below a 0.5 match nobody is returned, so the task stays unassigned.
function pickAssignee(users, requiredSkills) {
  if (!requiredSkills.length) return { user: null, matchScore: 0 };

  let bestUser = null;
  let bestScore = -1;

  users.forEach(user => {
    const matchedSkills = user.skills.filter(skill => requiredSkills.includes(skill));
    const score = matchedSkills.length / requiredSkills.length;

    if (
      score > bestScore ||
      (score === bestScore && user.currentTasks < bestUser.currentTasks)
    ) {
      bestUser = user;
      bestScore = score;
    }
  });

  return { user: bestScore >= 0.5 ? bestUser : null, matchScore: Math.max(bestScore, 0) };
}

const taskView = (task, users) => ({
  ...task,
  assignee: users.find(user => user.id === task.assigned_to)?.name || null
});

app.get('/users', route(async (req, res) => {
  res.json(await loadCandidates());
}));

app.get('/tasks', route(async (req, res) => {
  const tasks = await run(db.from('tasks').select('*').order('created_at', { ascending: false }));
  const users = await run(db.from('users').select('id, name'));
  res.json(tasks.map(task => taskView(task, users)));
}));

// What assignment would happen for a title, without saving anything.
app.post('/tasks/suggest', route(async (req, res) => {
  const requiredSkills = inferSkills(req.body.title || '');
  const { user, matchScore } = pickAssignee(await loadCandidates(), requiredSkills);
  res.json({
    requiredSkills,
    type: SKILL_TYPES[requiredSkills[0]] || 'General',
    assignee: user && { id: user.id, name: user.name, role: user.role },
    matchScore
  });
}));

app.post('/tasks/create', route(async (req, res) => {
  const { title, deadline } = req.body;
  if (!title) return res.status(400).json({ error: 'Missing title' });

  const requiredSkills = req.body.requiredSkills || inferSkills(title);
  const task = await run(db.from('tasks').insert({
    title,
    required_skills: requiredSkills,
    type: SKILL_TYPES[requiredSkills[0]] || 'General',
    deadline: deadline || null
  }).select().single());

  res.json(task);
}));

app.post('/tasks/assign', route(async (req, res) => {
  const { taskId } = req.body;

  const task = await run(db.from('tasks').select('*').eq('id', taskId).maybeSingle());
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { user, matchScore } = pickAssignee(await loadCandidates(), task.required_skills);
  const updated = await run(db.from('tasks')
    .update({ assigned_to: user?.id || null, match_score: matchScore })
    .eq('id', taskId).select().single());

  res.json({ task: { ...updated, assignee: user?.name || null }, matchScore });
}));

app.patch('/tasks/:id', route(async (req, res) => {
  const { status } = req.body;
  if (!['todo', 'in_progress', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const task = await run(db.from('tasks').update({ status }).eq('id', req.params.id).select().maybeSingle());
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
}));

app.get('/', (req, res) => {
  res.send('Task Skill Engine is running 🚀');
});

// CREATE USER
app.post('/users/create', route(async (req, res) => {
  const { id, name, skills, role } = req.body;

  if (!id || !name || !skills) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const row = { id, name, skills };
  if (role) row.role = role;
  await run(db.from('users').upsert(row, { onConflict: 'id' }));
  res.json({ message: 'User created' });
}));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
