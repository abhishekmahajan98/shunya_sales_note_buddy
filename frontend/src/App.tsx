import { useState, useEffect } from 'react';
import DebriefRoom from './components/DebriefRoom';
import ExtractionPanel from './components/ExtractionPanel';
import ReviewSummary from './components/ReviewSummary';
import Auth from './components/Auth';
import ClientSelector from './components/ClientSelector';
import PreBrief from './components/PreBrief';
import { type Client } from './data/clients';
import { Sparkles, LogOut, User as UserIcon, ChevronRight, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExtractionData {
  client_type?: string;
  portfolio_sentiment?: string;
  flight_risk?: string;
  macro_concerns?: string[];
  next_steps?: string;
  extensive_notes?: string;
  us_equity_etf_interest?: string;
  intl_em_interest?: string;
  alpha_badger_mention?: string;
  tech_approach_interest?: string;
  ai_outlook_discussed?: string;
  oil_energy_discussed?: string;
}

interface Message {
  role: 'user' | 'agent';
  text: string;
}

type View = 'select_client' | 'prebrief' | 'debrief' | 'review';

function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('shunya_token'));
  const [view, setView] = useState<View>('select_client');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractionData>({});
  const [missingFields, setMissingFields] = useState<string[]>([]);
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
        console.error('Auth check failed', err);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setView('prebrief');
  };

  const handleStartDebrief = async () => {
    if (!token || !selectedClient) return;
    setIsCreatingSession(true);
    try {
      const res = await fetch('/api/debrief/session', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:             selectedClient.id,
          client_name:           selectedClient.name,
          client_type:           selectedClient.type,
          client_strategy_focus: selectedClient.strategy_focus,
          client_region:         selectedClient.region,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setCurrentSessionId(data.session_id);
        setExtractedData({ client_type: selectedClient.type });
        setMissingFields([]);
        setView('debrief');
      }
    } catch (err) {
      console.error('Failed to start session:', err);
    } finally {
      setIsCreatingSession(false);
    }
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
    setSelectedClient(null);
    setView('select_client');
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
        body: JSON.stringify({ finalData, summary, transcript }),
      });
      if (!response.ok) throw new Error('Sync failed');
    } catch (err) { console.error(err); }
  };

  // ── Loading spinner ─────────────────────────────────────────────────────────
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

  if (!token || !user) return <Auth onLogin={handleLogin} />;

  // ── Breadcrumb labels ───────────────────────────────────────────────────────
  const breadcrumbs: { key: View; label: string }[] = [
    { key: 'select_client', label: 'Select Client' },
    { key: 'prebrief',      label: 'Pre-Brief' },
    { key: 'debrief',       label: 'Debrief' },
    { key: 'review',        label: 'Review & Sync' },
  ];
  const currentBreadcrumbIdx = breadcrumbs.findIndex(b => b.key === view);

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.4) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[400px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.4) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* Main layout */}
      <div className="flex-1 flex flex-col h-full relative z-10" style={{ borderRight: '1px solid var(--border-subtle)' }}>

        {/* Top nav */}
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

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs">
            {breadcrumbs.slice(0, currentBreadcrumbIdx + 1).map((b, i) => (
              <span key={b.key} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />}
                <span style={{ color: i === currentBreadcrumbIdx ? '#a5b4fc' : 'var(--text-muted)', fontWeight: i === currentBreadcrumbIdx ? 600 : 400 }}>
                  {b.label}
                </span>
              </span>
            ))}
            {selectedClient && view !== 'select_client' && (
              <span className="flex items-center gap-1.5 ml-1">
                <span className="text-slate-700">·</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
                  {selectedClient.name}
                </span>
              </span>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
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
            <button onClick={handleLogout} className="p-2 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-400 text-slate-500" title="Log Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {view === 'select_client' && (
              <motion.div key="select_client" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-hidden">
                <ClientSelector onSelect={handleSelectClient} />
              </motion.div>
            )}
            {view === 'prebrief' && selectedClient && (
              <motion.div key="prebrief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-hidden">
                <PreBrief
                  client={selectedClient}
                  onBack={() => setView('select_client')}
                  onStartDebrief={handleStartDebrief}
                  isCreatingSession={isCreatingSession}
                />
              </motion.div>
            )}
            {view === 'debrief' && (
              <motion.div key="debrief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <DebriefRoom
                  onEndDebrief={handleEndDebrief}
                  onExtractionUpdate={handleExtractionUpdate}
                  token={token}
                  sessionId={currentSessionId || ''}
                  autoStart={false}
                  onStartSession={() => {}}
                />
              </motion.div>
            )}
            {view === 'review' && (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <ReviewSummary
                  data={extractedData}
                  onBack={() => { setView('debrief'); setCurrentSessionId(null); }}
                  onPushToCRM={syncToCRM}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Extraction Panel — only during debrief */}
      {view === 'debrief' && (
        <ExtractionPanel data={extractedData} missingFields={missingFields} client={selectedClient} />
      )}
    </div>
  );
}

export default App;
