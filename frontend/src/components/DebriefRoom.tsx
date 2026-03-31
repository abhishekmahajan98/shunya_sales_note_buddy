import { useState, useEffect, useRef } from 'react';
import { Mic, Square, AudioLines } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'agent';
  text: string;
}

interface ExtractionData {
  client_type?: string;
  portfolio_sentiment?: string;
  flight_risk?: string;
  macro_concerns?: string[];
  next_steps?: string;
  extensive_notes?: string;
}

interface DebriefRoomProps {
  onEndDebrief: (extractedData: ExtractionData, transcript: Message[]) => void;
  onExtractionUpdate: (data: ExtractionData, missing: string[]) => void;
}

const API_BASE = 'http://localhost:8000/api';
const SESSION_ID = 'session-123';

export default function DebriefRoom({ onEndDebrief, onExtractionUpdate }: DebriefRoomProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [currentExtractions, setCurrentExtractions] = useState<ExtractionData>({});
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle Browser-Native TTS with voice optimization
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    // Prioritize natural voices available on the system
    const premiumVoices = ['Google US English', 'Samantha', 'Alex', 'Daniel'];
    const selectedVoice = voices.find(v => premiumVoices.some(pv => v.name.includes(pv))) || voices[0];
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log(`Using voice: ${selectedVoice.name}`);
    }
    
    utterance.pitch = 1.0;
    utterance.rate = 1.02; // Slightly faster for responsiveness
    
    utterance.onstart = () => setAgentSpeaking(true);
    utterance.onend = () => setAgentSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setIsThinking(false);
      
      setAgentSpeaking(false);
      
    } catch (err) {
      console.error("Mic error:", err);
      alert("Please ensure microphone permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsThinking(true);
    }
  };

  const processAudio = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const response = await fetch(`${API_BASE}/debrief/process/${SESSION_ID}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to process audio');
      
      const data = await response.json();
      
      // 1. Update message history with User and then Agent
      setMessages(prev => [
        ...prev, 
        { role: 'user', text: data.user_text || 'Audio message' },
        { role: 'agent', text: data.text }
      ]);

      // 2. Update Extractions
      setCurrentExtractions(data.extracted_data);
      onExtractionUpdate(data.extracted_data, data.missing_fields);
      
      // 3. Optimized TTS Response
      speak(data.text);
      
    } catch (err) {
      console.error("Processing error:", err);
    } finally {
      setIsThinking(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col h-full items-center max-w-4xl mx-auto w-full p-6">
      <div className="flex justify-between w-full items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            RIG Sales Debrief
          </h2>
          <p className="text-sm text-slate-400 flex items-center gap-2 mt-1">
             <span className="w-2 h-2 rounded-full bg-green-500"></span>
             HTTP Walkie-Talkie Active
          </p>
        </div>
        <button 
          onClick={() => onEndDebrief(currentExtractions, messages)}
          className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl transition-colors text-sm font-medium"
        >
          End & Review
        </button>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 w-full overflow-y-auto mb-8 pr-4 space-y-6 scrollbar-hide"
      >
        <AnimatePresence>
          {messages.length === 0 && (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
               className="h-full flex items-center justify-center text-center text-slate-500"
            >
               <p className="max-w-xs text-slate-400 italic">
                 Push the button to start your debrief. <br/> 
                 Record your message, then click again to stop and listen to Gemini.
               </p>
            </motion.div>
          )}

          {messages.map((msg, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-2xl p-4 ${
                msg.role === 'user' 
                  ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-500/30' 
                  : 'bg-slate-800 border border-slate-700 text-slate-200'
              }`}>
                <p className="text-lg leading-relaxed">{msg.text}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="relative group">
        <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
        <button
          onClick={toggleRecording}
          className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all transform hover:scale-105 shadow-2xl ${
            isRecording 
              ? 'bg-red-500/20 border-2 border-red-500 text-red-400' 
              : 'bg-indigo-500 hover:bg-indigo-600 text-white'
          }`}
        >
          {isRecording ? (
            <div className="flex flex-col items-center">
               <Square className="w-8 h-8 fill-current" />
            </div>
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </button>
      </div>
      
      {isThinking && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center gap-2 text-indigo-400 text-sm">
           <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"></div> Gemini is processing...
        </motion.div>
      )}
      {agentSpeaking && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center gap-2 text-indigo-400 text-sm">
           <AudioLines className="w-4 h-4 animate-pulse" /> Gemini is responding...
        </motion.div>
      )}
      {isRecording && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center gap-2 text-red-400 text-sm">
           <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div> Recording... Click to Stop
        </motion.div>
      )}

    </div>
  );
}
