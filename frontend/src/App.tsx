import { useState, useEffect } from 'react';
import DebriefRoom from './components/DebriefRoom';
import ExtractionPanel from './components/ExtractionPanel';
import ReviewSummary from './components/ReviewSummary';
import Auth from './components/Auth';
import { Sparkles, LogOut, User as UserIcon, ChevronRight, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExtractionData {
  client_type?: string;
  portfolio_sentiment?: string;
  flight_risk?: string;
  macro_concerns?: string[];
  next_steps?: string;
  extensive_notes?: string;
}

interface Message {
  role: 'user' | 'agent';
  text: string;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('shunya_token'));
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [view, setView] = useState<'debrief' | 'review'>('debrief');
  const [extractedData, setExtractedData] = useState<ExtractionData>({});
  const [missingFields, setMissingFields] = useState<string[]>(['client_type', 'portfolio_sentiment', 'flight_risk', 'macro_concerns', 'next_steps']);
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('shunya_token');
      if (!storedToken) { setLoading(false); return; }
      try {
        const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${storedToken}` } });
        const data = await res.json();
        if (data.status === 'success') { setUser(data.user); setToken(storedToken); }
        else { localStorage.removeItem('shunya_token'); setToken(null); }
      } catch (err) {
        console.error("Auth check failed", err);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const startNewSession = async (authToken: string, autoConnect = false) => {
    try {
      const res = await fetch('/api/debrief/session', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` } });
      const _data = await res.json();
      if (_data.status === 'success') {
        setCurrentSessionId(_data.session_id);
        setIsAutoConnecting(autoConnect);
        setExtractedData({});
        setMissingFields(['client_type', 'portfolio_sentiment', 'flight_risk', 'macro_concerns', 'next_steps', 'extensive_notes']);
      }
    } catch (err) { console.error("Failed to start session:", err); }
  };

  const handleLogin = (newToken: string, newUser: any) => {
    localStorage.setItem('shunya_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('shunya_token');
    setToken(null);
    setUser(null);
    setCurrentSessionId(null);
  };

  const handleEndDebrief = (_data: ExtractionData, finalTranscript: Message[]) => {
    setTranscript(finalTranscript);
    setView('review');
  };

  const handleExtractionUpdate = (_data: ExtractionData, missing: string[]) => {
    setExtractedData(_data);
    setMissingFields(missing);
  };

  const syncToCRM = async (finalData: ExtractionData, summary: string) => {
    try {
      const response = await fetch('/api/crm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ finalData, summary, transcript })
      });
      if (!response.ok) throw new Error('Sync failed');
    } catch (err) { console.error(err); }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ring-spin" style={{ borderTopColor: 'rgba(99,102,241,0.8)' }} />
            <div className="absolute inset-2 rounded-full border-2 border-purple-500/20 animate-ring-reverse" style={{ borderBottomColor: 'rgba(139,92,246,0.8)' }} />
            <div className="absolute inset-4 rounded-full bg-indigo-500/20 animate-orb-pulse flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium tracking-widest uppercase">Initializing</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.4) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[400px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.4) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full relative z-10" style={{ borderRight: '1px solid var(--border-subtle)' }}>
        {/* Top navigation bar */}
        <div className="flex items-center justify-between px-6 h-[60px] shrink-0 glassmorphism" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))', border: '1px solid rgba(99,102,241,0.3)' }}>
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-slate-900" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white font-['Space_Grotesk']">
                Shunya <span className="text-gradient">Note Buddy</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">Sales Intelligence</p>
            </div>
          </div>

          {/* Center breadcrumb for review */}
          <AnimatePresence>
            {view === 'review' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-xs text-slate-500">
                <span className="hover:text-slate-300 cursor-pointer transition-colors" onClick={() => setView('debrief')}>
                  Debrief Room
                </span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-indigo-400 font-medium">Review & Sync</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right side: user pill + status + logout */}
          <div className="flex items-center gap-3">
            {/* Live badge */}
            <div className="tag tag-indigo flex items-center gap-1.5">
              <Radio className="w-2.5 h-2.5" />
              <span>Gemini 3.1 Live</span>
            </div>

            <div className="h-4 w-px" style={{ background: 'var(--border-subtle)' }} />

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <UserIcon className="w-3 h-3 text-indigo-400" />
              </div>
              <span className="text-xs font-medium text-slate-400">{user.email}</span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-400 text-slate-500"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {view === 'debrief' ? (
              <motion.div key="debrief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <DebriefRoom
                  onEndDebrief={handleEndDebrief}
                  onExtractionUpdate={handleExtractionUpdate}
                  token={token}
                  sessionId={currentSessionId || ''}
                  autoStart={isAutoConnecting}
                  onStartSession={() => {
                    setIsAutoConnecting(true);
                    startNewSession(token, true);
                  }}
                />
              </motion.div>
            ) : (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <ReviewSummary
                  data={extractedData}
                  onBack={() => { setView('debrief'); setIsAutoConnecting(false); setCurrentSessionId(null); }}
                  onPushToCRM={syncToCRM}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Extraction Panel - right sidebar */}
      {view === 'debrief' && (
        <ExtractionPanel data={extractedData} missingFields={missingFields} />
      )}
    </div>
  );
}

export default App;
