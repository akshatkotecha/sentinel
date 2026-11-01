// STARTS THE WHOLE APP WITH ONE COMMAND: npm start
// Clears any old Sentinel services, starts all four in this terminal, and checks
// that each one answers. Ctrl+C stops everything together.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const IS_WINDOWS = process.platform === 'win32';

// The Python inside backend/venv, which has the packages from requirements.txt.
const PYTHON = path.join(ROOT, 'backend', 'venv', IS_WINDOWS ? 'Scripts/python.exe' : 'bin/python');

const SERVICES = [
  { name: 'flask', port: 5001, check: '/health', cmd: `"${PYTHON}" app.py`, cwd: 'backend' },
  { name: 'behaviour', port: 3002, check: '/health', cmd: 'node backend/server.js', cwd: '.' },
  { name: 'tasks', port: 3000, check: '/', cmd: 'node backend/index.js', cwd: '.' },
  // --strictPort makes Vite fail instead of quietly moving to a different port.
  { name: 'frontend', port: 5173, check: '/', cmd: 'npm run dev -- --strictPort', cwd: 'frontend' }
];

const running = [];
let stopping = false;

// True if something answers on this port. Any HTTP response counts.
async function isLive(port, urlPath = '/') {
  try {
    await fetch(`http://localhost:${port}${urlPath}`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

// Stops a process and everything it started. Flask's debug mode runs a second
// Python process, and npm starts Vite, so stopping only the parent leaves them behind.
function killTree(pid) {
  try {
    if (IS_WINDOWS) execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGTERM');
  } catch {
    // Already gone, which is what we wanted.
  }
}

// Windows only: finds old copies of these services on our ports and stops them.
// The command must look like Sentinel, so another project's server is never touched.
function clearOldServices() {
  if (!IS_WINDOWS) return;

  const ports = SERVICES.map((service) => service.port).join(',');
  const script = `Get-NetTCPConnection -State Listen -LocalPort ${ports} -ErrorAction SilentlyContinue | ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess) OR ParentProcessId=$($_.OwningProcess)" } | ForEach-Object { '' + $_.ProcessId + ' ' + $_.CommandLine }; exit 0`;
  const output = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });

  const isSentinel = (command) =>
    /venv[\\/]Scripts[\\/]python(\.exe)?"?\s+app\.py/.test(command) ||
    /backend[\\/](server|index)\.js/.test(command) ||
    (command.includes('vite') && command.toLowerCase().includes(ROOT.toLowerCase()));

  output.split(/\r?\n/).forEach((line) => {
    const [pid, ...command] = line.split(' ');
    if (pid && isSentinel(command.join(' '))) {
      killTree(pid);
      console.log(`Stopped an old Sentinel process (${pid})`);
    }
  });
}

// Stops every service we started, then exits.
function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping Sentinel...');
  running.forEach((child) => killTree(child.pid));
  process.exit(exitCode);
}

// Starts one service and labels each line of its output with the service's name.
function startService(service) {
  const child = spawn(service.cmd, {
    cwd: path.join(ROOT, service.cwd),
    shell: true,
    detached: !IS_WINDOWS,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  const print = (data) => {
    data.toString().split(/\r?\n/).filter(Boolean).forEach((line) => {
      console.log(`[${service.name}] ${line}`);
    });
  };
  child.stdout.on('data', print);
  child.stderr.on('data', print);

  // If one service dies the app can't work, so stop the rest rather than half-run.
  child.on('exit', () => {
    if (stopping) return;
    console.error(`\n${service.name} stopped unexpectedly. See its messages above.`);
    stopAll(1);
  });

  running.push(child);
}

async function main() {
  if (!fs.existsSync(PYTHON)) {
    console.error('Python packages are not set up. Run these once, then try again:');
    console.error('  cd backend');
    console.error('  py -m venv venv');
    console.error('  .\\venv\\Scripts\\python -m pip install -r requirements.txt');
    process.exit(1);
  }

  clearOldServices();

  // Anything still answering isn't ours, so report it instead of stopping it.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  for (const { name, port } of SERVICES) {
    if (await isLive(port)) {
      console.error(`Port ${port} (needed by ${name}) is being used by another program. Close it and try again.`);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => stopAll());
  process.on('SIGTERM', () => stopAll());
  SERVICES.forEach(startService);

  // Check every second, for up to a minute, until all four services answer.
  for (let second = 0; second < 60; second++) {
    const live = await Promise.all(SERVICES.map((service) => isLive(service.port, service.check)));
    if (live.every(Boolean)) {
      console.log('\nSENTINEL IS LIVE');
      SERVICES.forEach((service) => console.log(`  ${service.name}: http://localhost:${service.port}`));
      console.log('\nOpen http://localhost:5173. Press Ctrl+C here to stop everything.\n');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error('\nA service did not start within a minute. See the messages above.');
  stopAll(1);
}

main();
