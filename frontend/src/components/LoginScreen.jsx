import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Users, Rocket, Copy, Check, ArrowRight, Terminal } from 'lucide-react';
import { TASKS_API, request } from '../api';

export default function LoginScreen({ onLogin }) {
  const [step, setStep] = useState(2);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // DATA STATES
  const [profile, setProfile] = useState({ name: '', stacks: '', projects: '' });
  const [teamData, setTeamData] = useState({ name: '', title: '', desc: '' });
  const [generatedCode, setGeneratedCode] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // --- ACTIONS ---

  const saveProfile = async () => {
    const id = profile.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) { setError('Enter a codename first.'); return; }

    const skills = profile.stacks.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    setLoading(true);
    setError('');
    try {
      await request(`${TASKS_API}/users/create`, 'POST', { id, name: profile.name.trim(), skills });
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const generateTeamCode = () => {
    if (!teamData.name || !teamData.title) return;
    setLoading(true);
    setTimeout(() => {
      const randomCode = `SYN-${Math.floor(1000 + Math.random() * 9000)}-${teamData.name.substring(0,3).toUpperCase()}`;
      setGeneratedCode(randomCode);
      setLoading(false);
    }, 1500);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const enterDashboard = () => {
    onLogin(generatedCode || joinCode, profile);
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center overflow-hidden font-sans">
      <div className="absolute inset-0 bg-cyber-black/90" />

      <div className="relative z-10 w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="inline-flex items-center gap-2 bg-neon-blue/10 text-neon-blue px-4 py-1 rounded-full text-xs font-mono border border-neon-blue/20 mb-4">
            <div className="w-2 h-2 rounded-full bg-neon-blue animate-pulse" />
            PROTOCOL: INITIALIZATION
          </motion.div>
          <h1 className="text-4xl font-bold text-white tracking-tighter mb-1">SENTINEL</h1>
          <p className="text-gray-500 text-xs font-mono tracking-widest">STEP {Math.min(step - 1, 3)}/3</p>
        </div>

        {/* MAIN CARD */}
        <div className="glass-panel rounded-2xl border-t border-neon-blue/20 p-8 min-h-[450px] flex flex-col justify-center relative overflow-hidden transition-all">
          
          <AnimatePresence mode='wait'>
            
            {/* === STEP 2: PROFILE CREATION === */}
            {step === 2 && (
              <motion.div key="s2" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                   <User className="w-6 h-6 text-neon-blue" />
                   <h2 className="text-xl font-bold text-white">Developer Profile</h2>
                </div>

                <div className="space-y-3">
                   <div className="bg-black/30 p-3 rounded-lg border border-white/10">
                      <label className="text-[10px] text-gray-500 font-mono block mb-1">CODENAME</label>
                      <input type="text" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-transparent text-white font-bold outline-none" />
                   </div>
                   <div className="bg-black/30 p-3 rounded-lg border border-white/10">
                      <label className="text-[10px] text-gray-500 font-mono block mb-1">TECH STACK (COMMA SEPARATED)</label>
                      <input type="text" placeholder="frontend, backend, ml, react, node, python..." value={profile.stacks} onChange={e => setProfile({...profile, stacks: e.target.value})} className="w-full bg-transparent text-white outline-none placeholder:text-gray-700" />
                   </div>
                   <div className="bg-black/30 p-3 rounded-lg border border-white/10">
                      <label className="text-[10px] text-gray-500 font-mono block mb-1">PREVIOUS PROJECTS</label>
                      <input type="text" placeholder="Portfolio URL or Project Names..." value={profile.projects} onChange={e => setProfile({...profile, projects: e.target.value})} className="w-full bg-transparent text-white outline-none placeholder:text-gray-700" />
                   </div>
                </div>

                {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
                <button onClick={saveProfile} disabled={loading} className="w-full bg-neon-blue text-black p-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,243,255,0.4)] transition-all mt-4">
                   CONFIRM DATA <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* === STEP 3: CHOOSE PATH === */}
            {step === 3 && (
              <motion.div key="s3" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-4">
                <h2 className="text-xl font-bold text-white text-center mb-6">Choose Protocol</h2>
                
                <button onClick={() => setStep(4)} className="w-full p-6 bg-gradient-to-r from-neon-purple/20 to-blue-500/20 border border-neon-purple/50 rounded-xl flex items-center gap-4 hover:scale-[1.02] transition-all group text-left">
                   <div className="w-12 h-12 rounded-full bg-neon-purple/20 flex items-center justify-center text-neon-purple group-hover:bg-neon-purple group-hover:text-black transition-colors">
                      <Rocket className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="font-bold text-white text-lg">Create Squad</h3>
                      <p className="text-xs text-gray-400">Initialize a new repository and generate access codes.</p>
                   </div>
                </button>

                <div className="text-center text-xs text-gray-600 font-mono">- OR -</div>

                <button onClick={() => setStep(5)} className="w-full p-6 bg-black/40 border border-white/10 rounded-xl flex items-center gap-4 hover:bg-white/5 transition-all text-left">
                   <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-gray-400">
                      <Users className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="font-bold text-gray-300 text-lg">Join Squad</h3>
                      <p className="text-xs text-gray-500">Enter an existing access code to sync.</p>
                   </div>
                </button>
              </motion.div>
            )}

            {/* === STEP 4: CREATE TEAM (LEADER) === */}
            {step === 4 && (
              <motion.div key="s4" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-4">
                {!generatedCode ? (
                  // FORM
                  <>
                    <h2 className="text-xl font-bold text-white mb-4">Project Parameters</h2>
                    <div className="space-y-3">
                        <input type="text" placeholder="Squad Name (e.g. Alpha)" className="w-full bg-black/30 border border-white/10 p-3 rounded-lg text-white focus:border-neon-purple outline-none" onChange={e => setTeamData({...teamData, name: e.target.value})} />
                        <input type="text" placeholder="Project Title" className="w-full bg-black/30 border border-white/10 p-3 rounded-lg text-white focus:border-neon-purple outline-none" onChange={e => setTeamData({...teamData, title: e.target.value})} />
                        <textarea placeholder="Mission Description..." className="w-full bg-black/30 border border-white/10 p-3 rounded-lg text-white focus:border-neon-purple outline-none h-20 resize-none" onChange={e => setTeamData({...teamData, desc: e.target.value})} />
                    </div>
                    <button onClick={generateTeamCode} disabled={!teamData.name} className="w-full bg-neon-purple text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 mt-2">
                       {loading ? <span className="animate-spin text-xl">⟳</span> : 'GENERATE UPLINK'}
                    </button>
                  </>
                ) : (
                  // RESULT: COPY CODE
                  <div className="text-center py-4">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500 animate-bounce">
                        <Check className="w-8 h-8" />
                    </div>
                    <h3 className="text-white font-bold text-lg mb-2">Squad Initialized</h3>
                    <p className="text-gray-500 text-xs mb-6">Share this access code with your team.</p>
                    
                    <div onClick={copyToClipboard} className="bg-black/50 border border-neon-blue/50 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:bg-neon-blue/10 transition-all group">
                        <code className="text-2xl font-mono text-neon-blue font-bold tracking-widest">{generatedCode}</code>
                        {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500 group-hover:text-white" />}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2 font-mono">{copied ? 'COPIED TO CLIPBOARD' : 'CLICK TO COPY'}</p>

                    <button onClick={enterDashboard} className="w-full mt-8 bg-white/10 hover:bg-white/20 text-white p-3 rounded-lg font-bold">
                        ENTER DASHBOARD
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* === STEP 5: JOIN TEAM (MEMBER) === */}
            {step === 5 && (
              <motion.div key="s5" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-6">
                 <div className="text-center">
                    <h2 className="text-xl font-bold text-white">Enter Access Code</h2>
                    <p className="text-gray-500 text-xs mt-2">Paste the code shared by your Team Leader.</p>
                 </div>
                 
                 <div className="relative">
                    <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                    <input 
                      type="text" 
                      placeholder="SYN-XXXX-TAG" 
                      className="w-full bg-black/40 border-2 border-white/10 focus:border-neon-blue rounded-xl py-4 pl-12 text-center text-xl text-white font-mono tracking-widest uppercase outline-none"
                      onChange={(e) => setJoinCode(e.target.value)}
                    />
                 </div>

                 <button onClick={enterDashboard} disabled={!joinCode} className="w-full bg-neon-blue text-black p-4 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(0,243,255,0.4)] transition-all">
                    ESTABLISH CONNECTION
                 </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Back Button (Only for steps > 1) */}
        {step > 2 && step !== 4 && (
            <button onClick={() => setStep(step - 1)} className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-gray-500 text-xs hover:text-white underline">
                Back to previous step
            </button>
        )}
      </div>
    </div>
  );
}