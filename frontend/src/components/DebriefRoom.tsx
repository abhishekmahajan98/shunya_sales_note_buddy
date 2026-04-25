import { useState, useEffect, useRef } from 'react';
import { Square, Activity, Play, ChevronRight, Mic, MicOff, BrainCircuit, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'agent';
  text: string;
  isPartial?: boolean;
  timestamp?: Date;
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

// Number of waveform bars
const WAVEFORM_BARS = 20;
const WAVEFORM_BARS_SMALL = 12;

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref-based buffers to avoid stale closures
  const outputTranscriptRef = useRef('');

  useEffect(() => { outputTranscriptRef.current = outputTranscript; }, [outputTranscript]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, inputTranscript, outputTranscript]);

  useEffect(() => {
    if (sessionId) {
      setMessages([]);
      setInputTranscript('');
      setOutputTranscript('');
      outputTranscriptRef.current = '';
    }
  }, [sessionId]);

  useEffect(() => {
    if (autoStart && sessionId && !isConnected && !isConnecting) {
      startSession();
    }
    return () => { stopSession(); };
  }, [autoStart, sessionId]);

  // Timer for elapsed session time
  useEffect(() => {
    if (isConnected) {
      setSessionStarted(true);
      setElapsedTime(0);
      timerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isConnected]);

  // Pre-load worklet
  useEffect(() => {
    const preLoad = async () => {
      try {
        const dummyCtx = new AudioContext();
        await dummyCtx.audioWorklet.addModule('/pcm-worklet.js');
        await dummyCtx.close();
      } catch (e) { console.error('Worklet pre-load failed:', e); }
    };
    preLoad();
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

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

      if (msg.type === 'history_sync') {
        const hist = (msg.history || []).map((h: any) => ({ ...h, timestamp: new Date() }));
        setMessages(hist);
        if (msg.extracted_data) onExtractionUpdate(msg.extracted_data, msg.missing_fields);
      }

      if (msg.type === 'input_transcript') {
        setInputTranscript(msg.text || '');
        if (msg.finished) {
          setMessages(prev => [...prev, { role: 'user', text: msg.text, timestamp: new Date() }]);
          setInputTranscript('');
        }
      }

      if (msg.type === 'output_transcript') {
        setOutputTranscript(prev => {
          if (msg.text.length > prev.length && msg.text.startsWith(prev)) return msg.text;
          if (prev && !msg.text.startsWith(prev)) return prev + (prev.endsWith(' ') ? '' : ' ') + msg.text;
          return msg.text;
        });
        if (msg.finished) {
          setMessages(prev => [...prev, { role: 'agent', text: outputTranscriptRef.current || msg.text, timestamp: new Date() }]);
          setOutputTranscript('');
        }
      }

      if (msg.type === 'audio') {
        const pcm16 = base64ToArrayBuffer(msg.data);
        playPcm24k(pcm16);
      }

      if (msg.type === 'interrupted') {
        setOutputTranscript('');
        setAgentSpeaking(false);
        audioQueueRef.current = [];
      }

      if (msg.type === 'extraction_update') {
        onExtractionUpdate(msg.extracted_data, msg.missing_fields);
      }
    };

    ws.onclose = () => { setIsConnected(false); setIsConnecting(false); stopMic(); };
    ws.onerror = (err) => { console.error('WS Error:', err); setIsConnected(false); setIsConnecting(false); };
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
          wsRef.current.send(JSON.stringify({ audio: arrayBufferToBase64(e.data) }));
        }
      };
      source.connect(worklet);
    } catch (err) {
      console.error('Mic error:', err);
      alert('Please ensure microphone permissions are granted.');
    }
  };

  const stopMic = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    sourceRef.current?.disconnect();
    workletRef.current?.disconnect();
    audioCtxRef.current?.close();
  };

  const stopSession = () => { wsRef.current?.close(); stopMic(); setIsConnected(false); };

  const playPcm24k = (buffer: ArrayBuffer) => {
    const pcm16 = new Int16Array(buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
    audioQueueRef.current.push(float32 as any);
    if (!isPlayingRef.current) processAudioQueue();
  };

  const processAudioQueue = async () => {
    if (audioQueueRef.current.length === 0) { isPlayingRef.current = false; setAgentSpeaking(false); return; }
    isPlayingRef.current = true;
    setAgentSpeaking(true);
    const nextChunk = audioQueueRef.current.shift()!;
    const playbackCtx = audioCtxRef.current || new AudioContext({ sampleRate: 24000 });
    const audioBuffer = playbackCtx.createBuffer(1, nextChunk.length, 24000);
    audioBuffer.copyToChannel(nextChunk as any, 0);
    const source = playbackCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playbackCtx.destination);
    source.onended = () => processAudioQueue();
    source.start();
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
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

  const isEmpty = messages.length === 0 && !inputTranscript && !outputTranscript;

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>
      {/* Session status bar */}
      <div className="flex items-center justify-between px-8 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div className={`status-dot ${isConnected ? 'active' : 'idle'}`} />
            <span className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: isConnected ? '#10b981' : 'var(--text-muted)' }}>
              {isConnecting ? 'Connecting...' : isConnected ? 'Session Live' : 'Ready'}
            </span>
          </div>

          {isConnected && (
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7' }}>
              <Clock className="w-3 h-3" />
              {formatTime(elapsedTime)}
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 text-xs font-medium mr-4"
              style={{ color: agentSpeaking ? '#a5b4fc' : 'var(--text-muted)' }}>
              <BrainCircuit className="w-3.5 h-3.5" />
              {agentSpeaking ? 'AI responding...' : 'Listening...'}
            </motion.div>
          )}
          <button
            onClick={() => onEndDebrief({}, messages)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            End & Review
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message feed + talk button layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Message area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-6 py-6 space-y-4">
          <AnimatePresence>
            {isEmpty && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-center py-16"
              >
                <div className="relative mb-8">
                  {/* Decorative rings */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-48 rounded-full border border-indigo-500/10 animate-ring-spin" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-36 h-36 rounded-full border border-purple-500/10 animate-ring-reverse" />
                  </div>
                  <div className="relative w-24 h-24 mx-auto rounded-full flex items-center justify-center"
                    style={{
                      background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.05) 100%)',
                      border: '1px solid rgba(99,102,241,0.2)',
                      boxShadow: '0 0 40px rgba(99,102,241,0.15)'
                    }}>
                    <Mic className="w-10 h-10 text-indigo-400" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3 font-['Space_Grotesk']">
                  {sessionId ? 'Ready to Debrief' : 'Start a New Session'}
                </h3>
                <p className="text-sm leading-relaxed max-w-sm" style={{ color: 'var(--text-muted)' }}>
                  {sessionId
                    ? 'Press Connect to begin. Gemini will listen, transcribe, and extract CRM data in real-time.'
                    : 'Click the Connect button below to create a session and start the AI-powered debrief.'}
                </p>
                {sessionId && (
                  <div className="mt-6 flex items-center gap-3">
                    {['VAD Detection', 'Live Transcription', 'CRM Extraction'].map((f, i) => (
                      <motion.div key={f} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 + 0.3 }}
                        className="tag tag-indigo">{f}</motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'agent' && (
                  <div className="w-7 h-7 rounded-lg mr-2.5 mt-0.5 shrink-0 flex items-center justify-center"
                    style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                )}
                <div className={`max-w-[72%] rounded-2xl px-5 py-3.5 ${msg.role === 'user'
                  ? 'rounded-tr-sm'
                  : 'rounded-tl-sm'
                  }`}
                  style={msg.role === 'user' ? {
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
                    border: '1px solid rgba(99,102,241,0.2)',
                    color: '#e0e7ff'
                  } : {
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'var(--text-primary)'
                  }}>
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                  {msg.timestamp && (
                    <p className="text-[10px] mt-1.5 opacity-40 font-medium">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Live input transcript (user speaking) */}
          <AnimatePresence>
            {inputTranscript && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex w-full justify-end">
                <div className="max-w-[72%] rounded-2xl rounded-tr-sm px-5 py-3.5"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.25)', color: 'rgba(165,180,252,0.7)' }}>
                  <p className="text-sm leading-relaxed italic">{inputTranscript}
                    <span className="inline-block ml-1 w-0.5 h-3.5 bg-indigo-400 animate-pulse rounded-sm align-text-bottom" />
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live output transcript (agent speaking) */}
          <AnimatePresence>
            {outputTranscript && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex w-full justify-start">
                <div className="w-7 h-7 rounded-lg mr-2.5 mt-0.5 shrink-0 flex items-center justify-center"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}>
                  <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="max-w-[72%] rounded-2xl rounded-tl-sm px-5 py-3.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                  <p className="text-sm leading-relaxed italic">{outputTranscript}
                    <span className="inline-block ml-1 w-0.5 h-3.5 bg-purple-400 animate-pulse rounded-sm align-text-bottom" />
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Talk Button Area ──────────────────────────────── */}
        <div className="shrink-0 flex flex-col items-center pb-10 pt-6 px-8 relative">
          {/* Waveform visualizer */}
          <div className="mb-6 flex items-center justify-center gap-1 h-10">
            {Array.from({ length: WAVEFORM_BARS }).map((_, i) => {
              const delay = (i / WAVEFORM_BARS) * 0.8;
              const duration = 0.5 + Math.random() * 0.6;
              return (
                <motion.div
                  key={i}
                  className="waveform-bar"
                  style={agentSpeaking ? { '--duration': `${duration}s`, '--delay': `${delay}s` } as any : undefined}
                  animate={isConnected ? {
                    scaleY: agentSpeaking
                      ? [0.2, 0.4 + Math.random() * 0.8, 0.2]
                      : [0.15, 0.3, 0.15],
                    opacity: agentSpeaking ? 1 : 0.3,
                  } : { scaleY: 0.15, opacity: 0.12 }}
                  transition={{
                    repeat: Infinity,
                    duration: agentSpeaking ? 0.5 + (i % 5) * 0.08 : 1.5,
                    delay: i * 0.04,
                    ease: 'easeInOut',
                  }}
                />
              );
            })}
          </div>

          {/* THE Talk Button */}
          <div className="relative flex items-center justify-center">
            {/* Outer glow ring — only when connected */}
            {isConnected && (
              <>
                <motion.div
                  className={`absolute rounded-full ${agentSpeaking ? 'animate-glow-danger' : 'animate-glow-breathe'}`}
                  style={{
                    width: 180,
                    height: 180,
                    background: agentSpeaking
                      ? 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)'
                      : 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
                  }}
                />
                {/* Spinning dashed ring */}
                <motion.div
                  className="absolute rounded-full animate-ring-spin"
                  style={{
                    width: 148,
                    height: 148,
                    border: `2px dashed ${agentSpeaking ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.2)'}`,
                  }}
                />
                <motion.div
                  className="absolute rounded-full animate-ring-reverse"
                  style={{
                    width: 164,
                    height: 164,
                    border: `1px solid ${agentSpeaking ? 'rgba(239,68,68,0.12)' : 'rgba(139,92,246,0.15)'}`,
                  }}
                />
              </>
            )}

            {/* Main button */}
            <button
              onClick={isConnected ? stopSession : onStartSession}
              disabled={isConnecting}
              className="relative z-10 flex flex-col items-center justify-center transition-all duration-300"
              style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: isConnecting
                  ? 'rgba(99,102,241,0.1)'
                  : isConnected
                  ? 'radial-gradient(circle at 40% 35%, rgba(239,68,68,0.25), rgba(220,38,38,0.1))'
                  : 'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.4), rgba(99,102,241,0.15))',
                border: `2px solid ${isConnected ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.5)'}`,
                boxShadow: isConnected
                  ? '0 0 0 1px rgba(239,68,68,0.1), inset 0 1px 1px rgba(255,255,255,0.05)'
                  : '0 0 0 1px rgba(99,102,241,0.1), inset 0 1px 1px rgba(255,255,255,0.08)',
                transform: isConnecting ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              {/* Inner icon area */}
              <div className="relative flex flex-col items-center gap-1.5">
                {isConnecting ? (
                  <>
                    <div className="w-10 h-10 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
                    <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-indigo-400 mt-0.5">Connecting</span>
                  </>
                ) : isConnected ? (
                  <>
                    <Square className="w-8 h-8 fill-red-400 text-red-400" />
                    <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-red-400">End</span>
                  </>
                ) : (
                  <>
                    {/* Mic icon with pulse ring */}
                    <div className="relative">
                      <Play className="w-9 h-9 text-indigo-300 fill-indigo-300 ml-1" />
                    </div>
                    <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-indigo-300">Connect</span>
                  </>
                )}
              </div>
            </button>
          </div>

          {/* Status label below button */}
          <div className="mt-5 flex items-center gap-2.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {isConnected ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-2">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500 tracking-wider uppercase text-[10px] font-bold">System Live</span>
                </span>
                <span className="text-slate-700">·</span>
                <span className="flex items-center gap-1 text-slate-500 text-[10px] uppercase tracking-wider">
                  {agentSpeaking ? (
                    <><span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />AI Speaking</>
                  ) : (
                    <><Mic className="w-3 h-3" /> Listening</>
                  )}
                </span>
              </motion.div>
            ) : (
              <span className="text-[10px] uppercase tracking-[0.15em]">
                {isConnecting ? 'Establishing secure connection...' : 'Click to begin live debrief session'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
