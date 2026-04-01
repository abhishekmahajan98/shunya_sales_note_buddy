import { useState, useEffect } from 'react';
import DebriefRoom from './components/DebriefRoom';
import ExtractionPanel from './components/ExtractionPanel';
import ReviewSummary from './components/ReviewSummary';
import Auth from './components/Auth';
import { Sparkles, LogOut, User as UserIcon } from 'lucide-react';

interface ExtractionData {
  client_type?: string;
  portfolio_sentiment?: string;
  flight_risk?: string;
  macro_concerns?: string[];
  next_steps?: string;
}

interface Message {
  role: 'user' | 'agent';
  text: string;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('rig_token'));
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [view, setView] = useState<'debrief' | 'review'>('debrief');
  const [extractedData, setExtractedData] = useState<ExtractionData>({});
  const [missingFields, setMissingFields] = useState<string[]>(['client_type', 'portfolio_sentiment', 'flight_risk', 'macro_concerns', 'next_steps']);
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('rig_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('http://localhost:8000/api/auth/me', {
          headers: { 'Authorization': `Bearer ${storedToken}` }
        });
        const data = await res.json();
        if (data.status === 'success') {
          setUser(data.user);
          setToken(storedToken);
          // We don't auto-start a session anymore; the user triggers it via "Connect"
        } else {
          localStorage.removeItem('rig_token');
          setToken(null);
        }
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
      const res = await fetch('http://localhost:8000/api/debrief/session', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const _data = await res.json();
      if (_data.status === 'success') {
        setCurrentSessionId(_data.session_id);
        setIsAutoConnecting(autoConnect);
        // Clear previous session data for the UI
        setExtractedData({});
        setMissingFields(['client_type', 'portfolio_sentiment', 'flight_risk', 'macro_concerns', 'next_steps', 'extensive_notes']);
      }
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  };

  const handleLogin = (newToken: string, newUser: any) => {
    localStorage.setItem('rig_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('rig_token');
    setToken(null);
    setUser(null);
    setCurrentSessionId(null);
  };

  const handleEndDebrief = (data: ExtractionData, finalTranscript: Message[]) => {
    setTranscript(finalTranscript);
    setView('review');
  };

  const handleExtractionUpdate = (_data: ExtractionData, missing: string[]) => {
    setExtractedData(_data);
    setMissingFields(missing);
  };

  const syncToCRM = async (finalData: ExtractionData, summary: string) => {
    try {
      const response = await fetch('http://localhost:8000/api/crm/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ finalData, summary, transcript })
      });
      if (!response.ok) throw new Error('Sync failed');
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full bg-[#0f172a] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!token || !user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen w-full bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      
      <div className="flex-1 flex flex-col h-full bg-slate-900 border-r border-slate-800">
         {/* Top bar logo style */}
         <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
               </div>
               <h1 className="text-lg font-bold tracking-wide">RIG <span className="text-indigo-400">Assistant</span></h1>
            </div>

            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-300">{user.email}</span>
               </div>
               <button 
                 onClick={handleLogout}
                 className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors group"
                 title="Log Out"
               >
                  <LogOut className="w-4 h-4" />
               </button>
            </div>
         </div>

         {/* Main content area */}
         <div className="flex-1 overflow-hidden">
            {view === 'debrief' ? (
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
            ) : (
              <ReviewSummary 
                data={extractedData} 
                onBack={() => {
                   setView('debrief');
                   setIsAutoConnecting(false);
                   setCurrentSessionId(null); // Reset for a possible new session
                }} 
                onPushToCRM={syncToCRM} 
              />
            )}
         </div>
      </div>

      {view === 'debrief' && (
        <ExtractionPanel 
          data={extractedData} 
          missingFields={missingFields} 
        />
      )}
    </div>
  );
}

export default App;
