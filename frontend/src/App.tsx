import React, { useState } from 'react';
import DebriefRoom from './components/DebriefRoom';
import ExtractionPanel from './components/ExtractionPanel';
import ReviewSummary from './components/ReviewSummary';
import { Sparkles } from 'lucide-react';

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
  const [view, setView] = useState<'debrief' | 'review'>('debrief');
  const [extractedData, setExtractedData] = useState<ExtractionData>({});
  const [missingFields, setMissingFields] = useState<string[]>(['client_type', 'portfolio_sentiment', 'flight_risk', 'macro_concerns', 'next_steps']);
  const [transcript, setTranscript] = useState<Message[]>([]);

  const handleEndDebrief = (data: ExtractionData, finalTranscript: Message[]) => {
    // Keep the live tracked data or merge it
    setTranscript(finalTranscript);
    setView('review');
  };

  const handleExtractionUpdate = (data: ExtractionData, missing: string[]) => {
    setExtractedData(data);
    setMissingFields(missing);
  };

  const syncToCRM = async (finalData: ExtractionData, summary: string) => {
    try {
      const response = await fetch('http://localhost:8000/api/crm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: finalData, summary, transcript })
      });
      if (!response.ok) throw new Error('Sync failed');
    } catch (err) {
      console.error(err);
      // Faking success for demo even if backend isn't up
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      
      <div className="flex-1 flex flex-col h-full bg-slate-900 border-r border-slate-800">
         {/* Top bar logo style */}
         <div className="h-16 border-b border-slate-800 flex items-center px-6 gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
               <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <h1 className="text-lg font-bold tracking-wide">RIG <span className="text-indigo-400">Debrief</span></h1>
         </div>

         {/* Main content area */}
         <div className="flex-1 overflow-hidden">
            {view === 'debrief' ? (
              <DebriefRoom 
                onEndDebrief={handleEndDebrief} 
                onExtractionUpdate={handleExtractionUpdate} 
              />
            ) : (
              <ReviewSummary 
                data={extractedData} 
                onBack={() => setView('debrief')} 
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
