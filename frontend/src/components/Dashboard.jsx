import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, MessageSquare, GitCommit, Trophy, Zap, Send, ArrowRight, CheckCircle2, Plus, BellRing, UserMinus, TrendingUp, ShieldCheck, Code2, ChevronRight } from 'lucide-react';
import CreateTaskModal from './CreateTaskModal';
import { API, TASKS_API, BEHAVIOUR_API, request } from '../api';

const STATUS_LABELS = { todo: 'TODO', in_progress: 'IN PROGRESS', done: 'DONE' };
const BOT_NAMES = ['AI_Bot', 'SQUAD AI'];

// ─── Code Analyser Panel ────────────────────────────────────────────────────
function CodeAnalyser() {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('analysis');

  const submit = async () => {
    if (!code.trim()) { setError('Paste some code first.'); return; }
    setError(''); setLoading(true); setResult(null);
    try {
      const res = await fetch(`${API}/analyze-and-rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: name || 'Anonymous', code, title: title || 'Untitled', expected_outputs: [] }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
      setTab('analysis');
    } catch (e) { setError(e.message || 'Server error'); }
    finally { setLoading(false); }
  };

  const score = result?.analysis?.final_score ?? null;
  const scoreColor = score >= 75 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444';

  return (
    <div className="h-full flex flex-col overflow-y-auto p-6 gap-5 text-sm">
      <h2 className="text-2xl font-black text-white tracking-tight italic">CODE ANALYSER</h2>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:border-cyan-400 outline-none" />
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Task title (optional)" className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:border-cyan-400 outline-none" />
      </div>
      <textarea value={code} onChange={e=>setCode(e.target.value)} placeholder="Paste your code here..." rows={10}
        className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-green-300 font-mono focus:border-cyan-400 outline-none resize-none" />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button onClick={submit} disabled={loading}
        className="flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-black text-xs py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(0,243,255,0.4)]">
        {loading ? 'Analysing…' : <><Code2 className="w-4 h-4" /> ANALYSE &amp; RANK <ChevronRight className="w-4 h-4" /></>}
      </button>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Tab switcher */}
          <div className="flex gap-2">
            {['analysis','leaderboard'].map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab===t ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {t === 'analysis' ? '📊 Analysis' : '🏆 Leaderboard'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab === 'analysis' && (
              <motion.div key="analysis" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-4">
                {/* Score hero */}
                <div className="flex items-center gap-6 p-5 bg-gray-900 rounded-2xl border border-white/10">
                  <div className="text-5xl font-black" style={{color: scoreColor}}>{Math.round(score ?? 0)}</div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-2">OVERALL SCORE</div>
                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                      <motion.div className="h-full rounded-full" style={{background: scoreColor}} initial={{width:0}} animate={{width:`${score}%`}} transition={{duration:0.8}} />
                    </div>
                    {result.user_rank && <div className="text-xs text-gray-400 mt-2">Your rank: <span className="text-white font-bold">#{result.user_rank}</span></div>}
                  </div>
                </div>

                {/* Checks */}
                <div className="bg-gray-900 rounded-xl p-4 border border-white/10 space-y-2">
                  <p className="text-xs text-gray-500 font-bold mb-3">CHECKS</p>
                  {[
                    ['Syntax OK', result.analysis.syntax_ok],
                    ['Has Functions', result.analysis.quality?.has_functions],
                    ['Has Tests', result.analysis.quality?.has_tests],
                    ['Not Too Small', !result.analysis.quality?.too_small],
                  ].map(([label, pass]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-gray-400">{label}</span>
                      <span className={pass ? 'text-green-400' : 'text-red-400'}>{pass ? '✅' : '❌'}</span>
                    </div>
                  ))}
                </div>

                {/* AI review */}
                {result.analysis.llm_result && (
                  <div className="bg-gray-900 rounded-xl p-4 border border-cyan-500/20 text-xs text-gray-300 leading-relaxed">
                    <p className="text-cyan-400 font-bold mb-2">AI REVIEW</p>
                    <p>{result.analysis.llm_result.reason}</p>
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'leaderboard' && (
              <motion.div key="lb" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="bg-gray-900 rounded-xl border border-white/10 overflow-hidden">
                {(result.leaderboard || []).map((entry, i) => (
                  <div key={entry.user} className={`flex items-center gap-3 px-4 py-3 border-b border-white/5 text-xs ${entry.user === (name || 'Anonymous') ? 'bg-cyan-500/10' : ''}`}>
                    <span className="w-6 text-center font-black text-gray-500">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span>
                    <span className="flex-1 text-white font-bold">{entry.user}</span>
                    <span className="text-cyan-400 font-mono font-bold">{Math.round(entry.score ?? 0)}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ userProfile }) {
  const [activeView, setActiveView] = useState('mission'); // 'mission' | 'analyser'
  const [team, setTeam] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const chatScrollRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [teamData, taskData, alertData, messages] = await Promise.all([
        request(`${BEHAVIOUR_API}/team`),
        request(`${TASKS_API}/tasks`),
        request(`${API}/alerts/live`),
        request(`${API}/chat/messages`),
      ]);
      setTeam(teamData);
      setAlerts(alertData.map(a => ({ ...a, id: `${a.user}-${a.type}` })));
      setTasks(taskData.map(t => ({
        ...t,
        status: STATUS_LABELS[t.status],
        risk: alertData.some(a => a.user === t.assignee) ? 'high' : 'low',
      })));
      setChatHistory(messages.map(m => ({
        id: m.id,
        sender: m.user,
        text: m.text,
        color: BOT_NAMES.includes(m.user) ? 'text-neon-blue' : 'text-cyan-300',
      })));
      setLoadError('');
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Scrolls only the chat box. scrollIntoView would also scroll every ancestor,
  // pushing the fixed panels up and cutting off the top of the page.
  const messageCount = chatHistory.length;
  useEffect(() => {
    const box = chatScrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messageCount]);

  // Writes demo activity to the database for a random team member.
  const simulateGitPush = async () => {
    if (!team.length) return;
    const user = team[Math.floor(Math.random() * team.length)];
    await request(`${BEHAVIOUR_API}/git/update/${user.id}`, 'POST', { commits: user.commits + 1 }).catch(e => setLoadError(e.message));
    refresh();
  };

  const nudgeUser = async (alert) => {
    setDismissed(prev => [...prev, alert.id]);
    await request(`${API}/chat/send`, 'POST', { user: 'SQUAD AI', text: `@${alert.user} ${alert.reason}` }).catch(e => setLoadError(e.message));
    refresh();
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) return;
    const text = chatMessage;
    setChatMessage('');
    await request(`${API}/chat/send`, 'POST', { user: userProfile?.name || 'You', text }).catch(e => setLoadError(e.message));
    refresh();
  };

  const addTask = async ({ title, requiredSkills }) => {
    setIsModalOpen(false);
    try {
      const task = await request(`${TASKS_API}/tasks/create`, 'POST', { title, requiredSkills });
      await request(`${TASKS_API}/tasks/assign`, 'POST', { taskId: task.id });
    } catch (e) { setLoadError(e.message); }
    refresh();
  };

  const moveTask = async (task) => {
    const status = task.status === 'TODO' ? 'in_progress' : 'done';
    await request(`${TASKS_API}/tasks/${task.id}`, 'PATCH', { status }).catch(e => setLoadError(e.message));
    refresh();
  };

  const maxCommits = Math.max(1, ...team.map(m => m.commits));
  const visibleAlerts = alerts.filter(a => !dismissed.includes(a.id));

  // --- NEW: GAMER GRADIENTS ---
  const getProgressColor = (current, max) => {
    const p = (current / max) * 100;
    if (p >= 80) return 'bg-gradient-to-r from-emerald-400 to-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.6)]';
    if (p >= 50) return 'bg-gradient-to-r from-yellow-400 to-orange-500 shadow-[0_0_15px_rgba(251,146,60,0.6)]';
    return 'bg-gradient-to-r from-red-500 to-pink-600 shadow-[0_0_15px_rgba(244,63,94,0.6)]';
  };

  // --- NEW: TAG COLORS ---
  const getTypeStyles = (type) => {
    if (type === 'Frontend') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    if (type === 'Backend') return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    if (type === 'AI') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
    return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="h-screen w-full flex flex-col bg-cyber-black overflow-hidden text-gray-300 font-sans">
      <header className="h-14 flex-shrink-0 border-b border-white/10 flex items-center justify-between px-6 bg-cyber-gray/50 backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple drop-shadow-[0_0_10px_rgba(188,19,254,0.5)]">SENTINEL</div>
          <div className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-400 font-mono">V.2.0.1 LIVE</div>
        </div>
        <div className="flex gap-3">
            <button onClick={() => setActiveView('mission')} className={`px-3 py-1 rounded text-xs font-mono border flex items-center gap-2 transition-all ${activeView === 'mission' ? 'bg-white/20 border-white/30 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}><Activity className="w-3 h-3" /> MISSION</button>
            <button onClick={() => setActiveView('analyser')} className={`px-3 py-1 rounded text-xs font-mono border flex items-center gap-2 transition-all ${activeView === 'analyser' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}><Code2 className="w-3 h-3" /> CODE ANALYSER</button>
            <button onClick={simulateGitPush} className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-xs font-mono border border-white/10 flex items-center gap-2 transition-all"><Zap className="w-3 h-3 text-yellow-400" /> SIMULATE PUSH</button>
        </div>
      </header>

      {loadError && <div className="bg-red-500/20 border-b border-red-500/50 text-red-300 text-xs font-mono px-6 py-2">{loadError}</div>}

      <div className="flex-1 min-h-0 grid grid-cols-5 grid-rows-[minmax(0,1fr)] overflow-hidden">
        {/* === LEFT: LEADERBOARD === */}
        <aside className="col-span-1 min-h-0 border-r border-white/5 bg-black/20 p-4 flex flex-col overflow-y-auto">
          <div className="flex items-center gap-2 mb-6 text-neon-purple"><Trophy className="w-5 h-5" /><h3 className="text-sm font-black tracking-widest uppercase text-white drop-shadow-md">RANKINGS</h3></div>
          <div className="space-y-4">
             <AnimatePresence>
               {team.map((member, index) => (
                 <motion.div layout key={member.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} 
                    className={`p-3 rounded-xl border relative overflow-hidden group transition-all duration-300
                    ${index === 0 ? 'bg-gradient-to-br from-yellow-500/10 to-transparent border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 
                      index === 1 ? 'bg-gradient-to-br from-gray-300/10 to-transparent border-gray-400/30' : 
                      index === 2 ? 'bg-gradient-to-br from-orange-700/10 to-transparent border-orange-700/30' : 'bg-white/5 border-white/5'}`}
                 >
                    {/* Rank Badge */}
                    {index < 3 && <div className={`absolute top-0 right-0 w-12 h-12 blur-xl opacity-20 rounded-full ${index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-gray-300' : 'bg-orange-600'}`}></div>}

                    <div className="flex justify-between items-center mb-3 relative z-10">
                      <div className="flex items-center gap-3">
                         {/* AVATAR instead of initials */}
                         <div className="relative">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`} alt="avatar" className="w-8 h-8 rounded-full border border-white/20 bg-gray-800" />
                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border border-black ${index === 0 ? 'bg-yellow-400 text-black' : index === 1 ? 'bg-gray-300 text-black' : index === 2 ? 'bg-orange-400 text-black' : 'bg-gray-700 text-gray-300'}`}>
                                {index + 1}
                            </div>
                         </div>
                         <span className={`text-sm font-bold ${index === 0 ? 'text-yellow-400' : 'text-gray-200'}`}>{member.name} {member.name === userProfile?.name && '(YOU)'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono"><GitCommit className="w-3 h-3" /> {member.commits}</div>
                    </div>

                    <div className="h-2 w-full bg-gray-900 rounded-full overflow-hidden relative z-10 mb-3 border border-white/5">
                       <motion.div className={`h-full rounded-full ${getProgressColor(member.commits, maxCommits)}`} initial={{ width: 0 }} animate={{ width: `${(member.commits / maxCommits) * 100}%` }} transition={{ duration: 0.8 }} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-2 relative z-10">
                        <div className="flex flex-col">
                            <span className="text-[9px] text-gray-500 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-neon-blue" /> VELOCITY</span>
                            <span className="text-xs font-bold text-white font-mono">{member.speed.toFixed(1)}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] text-gray-500 flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-green-400" /> ACCURACY</span>
                            <span className="text-xs font-bold text-white font-mono">{Math.round(member.accuracy * 100)}%</span>
                        </div>
                    </div>
                 </motion.div>
               ))}
             </AnimatePresence>
          </div>
        </aside>

        {/* === MIDDLE: TASK BOARD === */}
        {activeView === 'analyser' ? (
          <main className="col-span-3 min-h-0 bg-gradient-to-b from-gray-900/50 to-black overflow-y-auto">
            <CodeAnalyser />
          </main>
        ) : (
        <main className="col-span-3 min-h-0 relative bg-gradient-to-b from-gray-900/50 to-black">
          <div className="h-full overflow-y-auto p-6 pb-28">
          <div className="flex items-center justify-between mb-8"><h2 className="text-3xl font-black text-white tracking-tight drop-shadow-lg italic">MISSION CONTROL</h2></div>
          <div className="grid grid-cols-3 gap-6">
            {['TODO', 'IN PROGRESS', 'DONE'].map((status) => (
              <div key={status} className="flex flex-col h-full">
                 {/* BIGGER, BOLDER HEADERS */}
                 <div className="flex items-center gap-3 mb-5 border-b border-white/10 pb-2">
                    <div className={`w-3 h-3 rounded-full shadow-[0_0_10px] ${status === 'IN PROGRESS' ? 'bg-neon-blue shadow-neon-blue' : status === 'DONE' ? 'bg-green-500 shadow-green-500' : 'bg-gray-500 shadow-gray-500'}`}></div>
                    <h3 className={`text-lg font-black tracking-widest ${status === 'IN PROGRESS' ? 'text-neon-blue' : status === 'DONE' ? 'text-green-500' : 'text-gray-400'}`}>{status}</h3>
                 </div>
                 
                 <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex-1 min-h-[400px] shadow-inner shadow-black/50">
                    <AnimatePresence>
                      {tasks.filter(t => t.status === status).map((task) => (
                        <motion.div layoutId={String(task.id)} key={task.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} 
                            className={`p-5 mb-4 rounded-xl border bg-gray-900/90 backdrop-blur-xl relative group transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 
                            ${task.risk === 'high' ? 'border-red-500/50 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-white/10 hover:border-neon-blue/40'}`}
                        >
                          {task.risk === 'high' && status !== 'DONE' && <div className="absolute -top-3 -right-2 bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg shadow-red-600/50 animate-pulse">CRITICAL</div>}
                          
                          <div className="flex justify-between items-start mb-3">
                            {/* COLORED TAGS */}
                            <span className={`text-[10px] font-bold px-2 py-1 rounded border ${getTypeStyles(task.type)}`}>{task.type.toUpperCase()}</span>
                            
                            {/* PROFILE PIC ON TASK */}
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${task.assignee || 'unassigned'}`} alt="assignee" className="w-6 h-6 rounded-full border border-white/30 bg-gray-800" />
                          </div>
                          
                          <h4 className="text-base font-bold text-white mb-1 leading-snug">{task.title}</h4>
                          <p className="text-[10px] text-gray-500 font-mono mb-4">{task.assignee || 'UNASSIGNED'}</p>
                          
                          {status !== 'DONE' && <button onClick={() => moveTask(task)} className="w-full py-2 rounded-lg bg-white/5 hover:bg-neon-blue/20 border border-white/10 hover:border-neon-blue/50 text-xs font-bold text-gray-400 hover:text-neon-blue transition-all flex items-center justify-center gap-2 group-hover:opacity-100 opacity-80"><span>{status === 'TODO' ? 'INITIALIZE' : 'COMMIT'}</span> <ArrowRight className="w-3 h-3" /></button>}
                          {status === 'DONE' && <div className="text-xs text-green-400 flex items-center justify-center gap-2 font-black mt-2 bg-green-500/10 py-1 rounded"><CheckCircle2 className="w-3 h-3" /> DEPLOYED</div>}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                 </div>
              </div>
            ))}
          </div>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="absolute bottom-8 right-8 w-16 h-16 bg-neon-blue rounded-full text-black flex items-center justify-center shadow-[0_0_40px_rgba(0,243,255,0.6)] hover:scale-110 hover:rotate-90 transition-all z-40 group"><Plus className="w-8 h-8 stroke-[3px]" /></button>
        </main>
        )}

        {/* === RIGHT: ALERTS === */}
        <aside className="col-span-1 min-h-0 border-l border-white/5 bg-black/40 backdrop-blur-xl p-4 flex flex-col h-full">
          <div className="mb-4 flex-shrink-0 max-h-[45%] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 text-neon-red animate-pulse"><BellRing className="w-5 h-5" /><h3 className="text-sm font-black tracking-widest uppercase">LIVE ALERTS</h3></div>
            <div className="space-y-3">
               <AnimatePresence>
                 {visibleAlerts.length === 0 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-gray-800/50 border border-white/5 rounded-xl text-xs text-gray-500 text-center italic">Scanning for anomalies...</motion.div>}
                 {visibleAlerts.map((alert) => (
                   <motion.div key={alert.id} initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} className="p-4 bg-red-950/30 border-l-4 border-red-500 rounded-r-xl text-xs relative overflow-hidden shadow-[0_0_15px_rgba(220,38,38,0.1)]">
                     <div className="flex justify-between items-start mb-2"><span className="font-black text-red-500 text-sm">{alert.type.replace('_', ' ')}</span><span className="text-[9px] text-red-400 font-mono">{alert.severity}</span></div>
                     <span className="text-gray-300 text-xs block mb-3 leading-relaxed">{alert.reason}</span>
                     <button onClick={() => nudgeUser(alert)} className="w-full py-2 bg-red-500 hover:bg-red-400 text-white text-xs font-bold rounded flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-900/50"><UserMinus className="w-3 h-3" /> NUDGE {alert.user.toUpperCase()}</button>
                   </motion.div>
                 ))}
               </AnimatePresence>
            </div>
          </div>
          <div className="flex-1 flex flex-col border-t border-white/10 pt-4 min-h-0">
             <div className="flex items-center gap-2 mb-4 text-neon-blue"><MessageSquare className="w-4 h-4" /><h3 className="text-xs font-bold tracking-widest uppercase">SQUAD_AI</h3></div>
            <div ref={chatScrollRef} className="flex-1 min-h-0 bg-black/40 rounded-xl border border-white/5 p-4 mb-3 text-xs overflow-y-auto font-mono">
               {chatHistory.map(msg => (<div key={msg.id} className={`mb-3 ${msg.color || 'text-gray-400'}`}><span className="font-bold opacity-70">[{msg.sender}]:</span> {msg.text}</div>))}
            </div>
            <div className="relative"><input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()} placeholder="Send command..." className="w-full bg-gray-900 border border-white/10 rounded-xl p-3 pr-10 text-xs text-white focus:border-neon-blue outline-none transition-colors shadow-inner" /><Send className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer hover:text-white transition-colors" onClick={sendChatMessage} /></div>
          </div>
        </aside>
      </div>

      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onClone={addTask} />
    </div>
  );
}