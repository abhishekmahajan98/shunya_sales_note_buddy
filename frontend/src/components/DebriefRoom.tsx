import { useState, useEffect, useRef } from 'react';
import { Square, Activity, Zap, Play, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'agent';
  text: string;
  isPartial?: boolean;
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
  token: string;
  sessionId: string;
  autoStart?: boolean;
  onStartSession?: () => void;
}

export default function DebriefRoom({ 
  onEndDebrief, 
  onExtractionUpdate, 
  token, 
  sessionId,
  autoStart = false,
  onStartSession
}: DebriefRoomProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputTranscript, setInputTranscript] = useState("");
  const [outputTranscript, setOutputTranscript] = useState("");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const isRecordingRef = useRef(false);
  
  // Ref-based buffers to solve stale closure problems in the WebSocket handler
  const messagesRef = useRef<Message[]>([]);
  const inputTranscriptRef = useRef("");
  const outputTranscriptRef = useRef("");

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    inputTranscriptRef.current = inputTranscript;
  }, [inputTranscript]);

  useEffect(() => {
    outputTranscriptRef.current = outputTranscript;
  }, [outputTranscript]);

  // Sync ref with state for use in closures
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, inputTranscript, outputTranscript]);

  useEffect(() => {
    if (sessionId) {
      setMessages([]);
      setInputTranscript("");
      setOutputTranscript("");
      messagesRef.current = [];
      inputTranscriptRef.current = "";
      outputTranscriptRef.current = "";
    }
  }, [sessionId]);

  useEffect(() => {
    if (autoStart && sessionId && !isConnected && !isConnecting) {
      startSession();
    }
    return () => {
      stopSession();
    };
  }, [autoStart, sessionId]);
  
  // Pre-load audio worklet once
  useEffect(() => {
    const preLoad = async () => {
      try {
        const dummyCtx = new AudioContext();
        await dummyCtx.audioWorklet.addModule('/pcm-worklet.js');
        await dummyCtx.close();
      } catch (e) {
        console.error("Worklet pre-load failed:", e);
      }
    };
    preLoad();
  }, []);
  
  const startSession = async () => {
    if (isConnected || isConnecting) return;
    setIsConnecting(true);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/debrief/${sessionId}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = async () => {
      setIsConnected(true);
      setIsConnecting(false);
      await startMic();
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "history_sync") {
        setMessages(msg.history);
        if (msg.extracted_data) {
          onExtractionUpdate(msg.extracted_data, msg.missing_fields);
        }
      }

      if (msg.type === "input_transcript") {
        setInputTranscript(msg.text || "");
        if (msg.finished) {
           setMessages(prev => [...prev, { role: 'user', text: msg.text }]);
           setInputTranscript("");
        }
      }

      if (msg.type === "output_transcript") {
        setOutputTranscript(prev => {
          // If the new text already contains the old text, it's cumulative - use it as is
          if (msg.text.length > prev.length && msg.text.startsWith(prev)) return msg.text;
          // If it's a new fragment, append it with a space if needed
          if (prev && !msg.text.startsWith(prev)) {
             return prev + (prev.endsWith(" ") ? "" : " ") + msg.text;
          }
          return msg.text;
        });
        
        if (msg.text && isRecording) setIsRecording(false);
        if (msg.finished) {
           // Use the current accumulated value from the ref to avoid stale closure
           setMessages(prev => [...prev, { role: 'agent', text: outputTranscriptRef.current || msg.text }]);
           setOutputTranscript("");
        }
      }

      if (msg.type === "audio") {
        const pcm16 = base64ToArrayBuffer(msg.data);
        playPcm24k(pcm16);
      }

      if (msg.type === "interrupted") {
        setOutputTranscript("");
        setAgentSpeaking(false);
        audioQueueRef.current = []; // Clear queued audio on barge-in
      }

      if (msg.type === "extraction_update") {
        onExtractionUpdate(msg.extracted_data, msg.missing_fields);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsConnecting(false);
      stopMic();
    };

    ws.onerror = (err) => {
      console.error("WS Error:", err);
      setIsConnected(false);
      setIsConnecting(false);
    };
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      await audioCtx.audioWorklet.addModule('/pcm-worklet.js');
      const worklet = new AudioWorkletNode(audioCtx, 'pcm-worklet');
      workletRef.current = worklet;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      worklet.port.onmessage = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            audio: arrayBufferToBase64(e.data)
          }));
        }
      };

      source.connect(worklet);
    } catch (err) {
      console.error("Mic error:", err);
      alert("Please ensure microphone permissions are granted.");
    }
  };

  const stopMic = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    sourceRef.current?.disconnect();
    workletRef.current?.disconnect();
    audioCtxRef.current?.close();
  };

  const stopSession = () => {
    wsRef.current?.close();
    stopMic();
    setIsConnected(false);
  };

  const playPcm24k = (buffer: ArrayBuffer) => {
    const pcm16 = new Int16Array(buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    audioQueueRef.current.push(float32 as any);
    if (!isPlayingRef.current) {
       processAudioQueue();
    }
  };

  const processAudioQueue = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setAgentSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setAgentSpeaking(true);
    const nextChunk = audioQueueRef.current.shift()!;
    
    // We need a stable AudioContext for playback if the mic one is closed or different
    const playbackCtx = audioCtxRef.current || new AudioContext({ sampleRate: 24000 });
    
    const audioBuffer = playbackCtx.createBuffer(1, nextChunk.length, 24000);
    audioBuffer.copyToChannel(nextChunk as any, 0);

    const source = playbackCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playbackCtx.destination);
    
    source.onended = () => {
       processAudioQueue();
    };
    source.start();
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };

  return (
    <div className="flex flex-col h-full items-center max-w-4xl mx-auto w-full p-6">
      <div className="flex justify-between w-full items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            Shunya Note Buddy <span className="text-sm font-normal text-slate-500 ml-2">v3.1 Live</span>
          </h2>
          <p className="text-sm text-slate-400 flex items-center gap-2 mt-1">
             <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></span>
             {isConnected ? 'Live VAD Mode Active' : 'Disconnected'}
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => onEndDebrief({}, messages)}
            className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl transition-colors text-sm font-medium"
          >
            End & Review
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 w-full overflow-y-auto mb-8 pr-4 space-y-6 scrollbar-hide"
      >
        <AnimatePresence>
          {messages.length === 0 && !inputTranscript && !outputTranscript && (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
               className="h-full flex items-center justify-center text-center text-slate-500"
            >
               <div className="max-w-xs flex flex-col items-center gap-4">
                 <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Zap className="w-8 h-8 text-indigo-400" />
                 </div>
                 <p className="text-slate-400 italic">
                   Click "Connect" to start the live debrief. <br/> 
                   Gemini 3.1 will listen and respond in real-time.
                 </p>
               </div>
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

          {inputTranscript && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full justify-end"
            >
              <div className="max-w-[80%] rounded-2xl p-4 bg-indigo-600/10 text-indigo-200/70 border border-indigo-500/20 italic">
                <p className="text-lg leading-relaxed">{inputTranscript}...</p>
              </div>
            </motion.div>
          )}

          {outputTranscript && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full justify-start"
            >
              <div className="max-w-[80%] rounded-2xl p-4 bg-slate-800/50 border border-slate-700 text-slate-400 italic">
                <p className="text-lg leading-relaxed">{outputTranscript}...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {isConnected && (
          <div className="flex gap-1 h-8 items-end">
            {[...Array(12)].map((_, i) => (
              <motion.div 
                key={i}
                animate={{ 
                  height: agentSpeaking ? [8, 32, 12, 24, 8] : [4, 8, 4],
                  opacity: agentSpeaking ? 1 : 0.3
                }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 0.8, 
                  delay: i * 0.05 
                }}
                className="w-1.5 bg-indigo-400 rounded-full"
              />
            ))}
          </div>
        )}

        <div className="relative group">
          <div className={`absolute -inset-4 bg-gradient-to-r ${isConnected ? 'from-red-500 to-orange-600' : 'from-indigo-500 to-purple-600'} rounded-full blur-xl opacity-20 group-hover:opacity-40 transition duration-500`}></div>
          <button
            onClick={isConnected ? stopSession : onStartSession}
            disabled={isConnecting}
            className={`relative z-10 w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all transform hover:scale-105 shadow-2xl ${
              !isConnected
                ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                : 'bg-red-500/10 border-2 border-red-500 text-red-500'
            }`}
          >
            {!isConnected ? (
              <>
                {isConnecting ? (
                  <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                ) : (
                  <>
                    <Play className="w-10 h-10 ml-1" />
                    <span className="text-[10px] font-bold mt-1">CONNECT</span>
                  </>
                )}
              </>
            ) : (
              <>
                <Square className="w-8 h-8 fill-current" />
                <span className="text-[10px] font-bold mt-1">STOP</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-widest text-slate-500">
           {isConnected ? (
             <span className="flex items-center gap-2 text-green-500">
               <Activity className="w-3 h-3" /> System Live
             </span>
           ) : (
             <span className="flex items-center gap-2">
               <Info className="w-3 h-3" /> Ready to sync
             </span>
           )}
        </div>
      </div>
    </div>
  );
}
