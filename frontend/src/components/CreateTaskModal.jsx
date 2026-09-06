import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Bot, Zap, ArrowRight } from 'lucide-react';

export default function CreateTaskModal({ isOpen, onClose, onClone }) {
  const [title, setTitle] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiDecision, setAiDecision] = useState(null); // Stores the Auto-Assignment

  // --- THE "BRAIN" ---
  // This effect listens to what you type and decides who gets the job.
  useEffect(() => {
    if (!title) {
        setAiDecision(null);
        return;
    }

    setIsAnalyzing(true);
    setAiDecision(null);

    // Simulate AI Processing Delay (Debounce)
    const timeoutId = setTimeout(() => {
        setIsAnalyzing(false);
        analyzeTaskContent(title);
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [title]);


  // --- MOCK AI LOGIC ---
  // In a real app, this would send the text to an LLM provider
  const analyzeTaskContent = (text) => {
    const lowerText = text.toLowerCase();
    
    let decision = { assignee: 'Dev_Sarah', role: 'Backend', confidence: '85%', skill: 'Database' };

    // Keyword Matching
    if (lowerText.includes('ui') || lowerText.includes('css') || lowerText.includes('button') || lowerText.includes('animation') || lowerText.includes('frontend')) {
        decision = { assignee: 'Dev_Alex', role: 'Frontend', confidence: '98%', skill: 'React/CSS' };
    } 
    else if (lowerText.includes('api') || lowerText.includes('server') || lowerText.includes('database') || lowerText.includes('auth')) {
        decision = { assignee: 'Dev_Sarah', role: 'Backend', confidence: '99%', skill: 'Node.js' };
    }
    else if (lowerText.includes('ai') || lowerText.includes('model') || lowerText.includes('train') || lowerText.includes('data')) {
        decision = { assignee: 'Dev_Rohan', role: 'AI Eng', confidence: '96%', skill: 'Python/ML' };
    }

    setAiDecision(decision);
  };

  const handleSubmit = () => {
    if (!title || !aiDecision) return;
    
    onClone({
        title,
        assignee: aiDecision.assignee,
        type: aiDecision.role, // Mapping Role to Task Type
        risk: 'low' // Default risk
    });
    
    // Reset and close
    setTitle('');
    setAiDecision(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      
      {/* Modal Card */}
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-lg bg-[#0a0a0f] border border-white/10 rounded-2xl p-8 shadow-[0_0_50px_rgba(188,19,254,0.2)] overflow-hidden"
      >
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-neon-purple/20 blur-[50px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-neon-blue/20 blur-[50px] pointer-events-none" />

        {/* Header */}
        <div className="flex justify-between items-center mb-8 relative z-10">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-neon-blue to-neon-purple flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                </div>
                AUTO-DELEGATE
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-6 h-6" />
            </button>
        </div>

        {/* Input Area */}
        <div className="space-y-6 relative z-10">
            <div>
                <label className="text-xs font-mono text-gray-500 mb-2 block tracking-widest">TASK DIRECTIVE</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Describe the task (e.g. 'Fix Auth API')"
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-5 text-lg text-white placeholder:text-gray-700 focus:border-neon-purple outline-none font-sans transition-all focus:bg-white/10"
                        autoFocus
                    />
                    {isAnalyzing && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                             <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-neon-blue"></div>
                        </div>
                    )}
                </div>
            </div>

            {/* AI Analysis Result */}
            <div className="min-h-[100px] bg-black/40 rounded-xl border border-white/5 p-4 flex flex-col justify-center relative overflow-hidden transition-all">
                
                {!title ? (
                    <div className="flex flex-col items-center justify-center text-gray-700 gap-2">
                        <Bot className="w-8 h-8 opacity-50" />
                        <span className="text-xs font-mono">WAITING FOR INPUT...</span>
                    </div>
                ) : isAnalyzing ? (
                    <div className="flex items-center gap-3 text-neon-blue font-mono text-sm animate-pulse">
                        <Zap className="w-4 h-4" />
                        <span>SCANNING SKILL MATRICES...</span>
                    </div>
                ) : aiDecision ? (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full"
                    >
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-400 font-mono">OPTIMAL ASSIGNMENT FOUND:</span>
                            <span className="text-xs text-green-400 font-bold font-mono">{aiDecision.confidence} MATCH</span>
                        </div>
                        
                        <div className="flex items-center gap-4 bg-white/5 p-3 rounded-lg border border-neon-purple/30">
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-black border border-white/20 flex items-center justify-center text-white font-bold">
                                {aiDecision.assignee.charAt(4)}
                            </div>
                            
                            <div className="flex-1">
                                <div className="text-white font-bold flex items-center gap-2">
                                    {aiDecision.assignee}
                                    <span className="text-[10px] bg-neon-blue/20 text-neon-blue px-1.5 py-0.5 rounded border border-neon-blue/30">
                                        {aiDecision.skill}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                    Role: {aiDecision.role}
                                </div>
                            </div>
                            
                            <div className="w-8 h-8 rounded-full bg-neon-purple/20 flex items-center justify-center text-neon-purple">
                                <Bot className="w-4 h-4" />
                            </div>
                        </div>
                    </motion.div>
                ) : null}
            </div>

            {/* Action Button */}
            <button 
                onClick={handleSubmit}
                disabled={!title || !aiDecision}
                className={`w-full py-4 rounded-xl font-bold tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
                    aiDecision 
                    ? 'bg-neon-purple text-white hover:shadow-[0_0_30px_rgba(188,19,254,0.5)] scale-[1.02]' 
                    : 'bg-gray-900 text-gray-600 cursor-not-allowed'
                }`}
            >
                <span>CONFIRM ASSIGNMENT</span>
                <ArrowRight className="w-5 h-5" />
            </button>
        </div>

      </motion.div>
    </div>
  );
}