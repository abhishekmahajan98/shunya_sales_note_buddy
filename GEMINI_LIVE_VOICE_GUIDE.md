# Gemini Live Voice Chat — Implementation Guide

A complete reference for building real-time, bidirectional AI voice chat using the **Gemini Live API**, a **FastAPI WebSocket backend**, and a **React frontend** with raw PCM audio streaming via the Web Audio API.

---

## Architecture Overview

```
Browser (React)
  │
  │  WebSocket (JSON frames)
  │  ├─ { audio: base64_pcm16 }  →  (mic chunks, continuous)
  │  ← { type: "audio", data: base64_pcm24k }  (AI voice response)
  │  ← { type: "input_transcript", text, finished }
  │  ← { type: "output_transcript", text, finished }
  │  ← { type: "interrupted" }
  │  ← { type: "extraction_update", ... }
  │
FastAPI Backend
  │
  ├─ WebSocket proxy bridge
  ├─ asyncio task: browser → Gemini queue
  ├─ asyncio task: Gemini session → browser relay
  │
Gemini Live API (google-genai SDK)
  └─ model: gemini-3.1-flash-live-preview
       Audio in (PCM 16kHz) → Audio out (PCM 24kHz)
       VAD (Voice Activity Detection) built-in
       Tool calls (function declarations)
       Input/output transcription
```

---

## Stack

| Layer | Tech |
|---|---|
| AI | Google Gemini Live API (`google-genai` SDK) |
| Backend | FastAPI + asyncio + WebSockets |
| Frontend | React + TypeScript |
| Audio capture | Web Audio API + AudioWorklet |
| Audio playback | Web Audio API (BufferSource queue) |
| Auth | Supabase JWT (token passed as WS query param) |

---

## Part 1 — Backend

### 1.1 Dependencies

```
# requirements.txt
fastapi
uvicorn
google-genai
python-dotenv
```

### 1.2 Gemini Client Setup

```python
# live_session.py
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

MODEL_ID = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-live-preview")
if not MODEL_ID.startswith("models/"):
    MODEL_ID = f"models/{MODEL_ID}"

client = genai.Client(
    api_key=os.getenv("GOOGLE_API_KEY"),
    http_options={'api_version': 'v1beta'}   # required for Live API
)
```

> **Important:** The `v1beta` api_version is required — the Live API is not available on `v1`.

---

### 1.3 Session Config

```python
config = {
    "tools": [{
        "function_declarations": [{
            "name": "save_crm_data",
            "description": "Saves structured CRM data from the conversation.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "client_type": {"type": "string"},
                    "next_steps":  {"type": "string"},
                }
            }
        }]
    }],
    "system_instruction": {
        "parts": [{"text": "You are a helpful sales analyst..."}]
    },
    "generation_config": {
        "response_modalities": ["AUDIO"],   # AI speaks back
        "speech_config": {
            "voice_config": {
                "prebuilt_voice_config": {
                    "voice_name": "Charon"  # Aoede, Charon, Fenrir, Kore, Puck
                }
            }
        }
    },
    # Enable auto VAD — AI detects when user stops speaking
    "realtime_input_config": {
        "automatic_activity_detection": {
            "disabled": False,
            "silence_duration_ms": 1000,
        }
    },
    # Get text transcripts of both sides
    "input_audio_transcription": {},
    "output_audio_transcription": {},
}
```

---

### 1.4 The Bridge — Core Pattern

The heart of the implementation is two concurrent asyncio tasks bridging the browser WebSocket ↔ Gemini Live session:

```python
async def stream_gemini_live(user_ws, session_id, on_extraction, on_message_completed, history=None):
    from asyncio import Queue
    from fastapi import WebSocketDisconnect

    user_outbox = Queue()          # Browser messages waiting to go to Gemini
    active_gemini_session = [None]

    # ── Task 1: Read from browser, put into queue ──────────────────
    async def task_from_browser():
        try:
            while True:
                msg = await user_ws.receive_json()
                await user_outbox.put(msg)
        except WebSocketDisconnect:
            pass

    # ── Task 2: Open Gemini session, relay in both directions ──────
    async def task_to_gemini():
        while True:  # auto-reconnect loop
            try:
                async with client.aio.live.connect(model=MODEL_ID, config=config) as gemini_session:
                    active_gemini_session[0] = gemini_session

                    # Start receiver coroutine
                    receiver = asyncio.create_task(gemini_receiver(gemini_session))

                    # Replay history if resuming a session
                    if history:
                        valid_turns = sanitize_and_merge_history(history)
                        if valid_turns:
                            await gemini_session.send(input=types.LiveClientContent(
                                turns=valid_turns,
                                turn_complete=True
                            ))

                    # Forward mic audio from queue to Gemini
                    while not receiver.done():
                        try:
                            msg = await asyncio.wait_for(user_outbox.get(), timeout=0.1)
                            if "audio" in msg:
                                await gemini_session.send_realtime_input(
                                    audio={
                                        "mime_type": "audio/pcm;rate=16000",
                                        "data": base64.b64decode(msg["audio"])
                                    }
                                )
                            elif "text" in msg:
                                await gemini_session.send(input=msg["text"], end_of_turn=True)
                        except asyncio.TimeoutError:
                            continue
            except Exception as e:
                print(f"Bridge flicker: {e}. Retrying...")
                await asyncio.sleep(1)   # backoff before reconnect

    tasks = [
        asyncio.create_task(task_from_browser()),
        asyncio.create_task(task_to_gemini())
    ]
    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for t in tasks:
        t.cancel()
```

---

### 1.5 Gemini Receiver — Handling All Message Types

```python
async def gemini_receiver(curr_session):
    session_state = {"current_user_text": "", "current_agent_text": ""}

    async for message in curr_session.receive():

        # ── Audio chunks from AI ───────────────────────────────────
        if message.server_content:
            sc = message.server_content

            if sc.interrupted:
                await user_ws.send_json({"type": "interrupted"})
                session_state["current_agent_text"] = ""

            # Live transcription of what the USER said
            if sc.input_transcription:
                it = sc.input_transcription
                session_state["current_user_text"] = it.text
                await user_ws.send_json({
                    "type": "input_transcript",
                    "text": it.text,
                    "finished": bool(getattr(it, "finished", False))
                })
                if getattr(it, "finished", False):
                    await on_message_completed("user", it.text)
                    session_state["current_user_text"] = ""

            # Live transcription of what the AI is saying
            if sc.output_transcription:
                ot = sc.output_transcription
                session_state["current_agent_text"] = ot.text
                await user_ws.send_json({
                    "type": "output_transcript",
                    "text": ot.text,
                    "finished": bool(getattr(ot, "finished", False))
                })
                if getattr(ot, "finished", False):
                    await on_message_completed("agent", ot.text)
                    session_state["current_agent_text"] = ""

            # Raw PCM audio bytes from AI — relay to browser
            if sc.model_turn:
                for part in sc.model_turn.parts:
                    if part.inline_data:
                        b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                        await user_ws.send_json({"type": "audio", "data": b64})

            # Turn complete — flush any un-finished transcripts
            if sc.turn_complete:
                for role_key, role in [("current_user_text", "user"), ("current_agent_text", "agent")]:
                    if session_state[role_key]:
                        await on_message_completed(role, session_state[role_key])
                        session_state[role_key] = ""

        # ── Tool calls ─────────────────────────────────────────────
        if message.tool_call:
            responses = []
            for call in message.tool_call.function_calls:
                if call.name == "save_crm_data":
                    result = save_crm_data(**call.args)
                    missing = await on_extraction(result)
                    responses.append(types.FunctionResponse(
                        id=call.id,
                        name=call.name,
                        response={
                            "status": "success",
                            "recorded_fields": list(result.keys()),
                            "remaining_missing_fields": missing
                        }
                    ))
            if responses:
                await curr_session.send_tool_response(function_responses=responses)
```

---

### 1.6 History Sanitization

The Gemini Live API requires history to **start with a `user` turn** and have **strictly alternating roles**. This helper fixes raw DB history before replaying it:

```python
def sanitize_and_merge_history(raw_history):
    merged = []
    for h in raw_history:
        role = "user" if h.get("role") == "user" else "model"
        text = h.get("text", "").strip()
        if not text:
            continue
        if not merged:
            if role != "user":
                continue               # drop leading model turns
            merged.append({"role": role, "text": text})
        elif merged[-1]["role"] == role:
            merged[-1]["text"] += f"\n\n{text}"   # merge consecutive same-role
        else:
            merged.append({"role": role, "text": text})

    return [
        types.Content(role=t["role"], parts=[types.Part.from_text(text=t["text"])])
        for t in merged
    ]
```

---

### 1.7 FastAPI WebSocket Endpoint

```python
@app.websocket("/api/ws/debrief/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, token: str = None):
    await websocket.accept()

    # Auth: verify Supabase JWT passed as ?token=...
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return
    try:
        user_res = supabase.auth.get_user(token)
        if not user_res or not user_res.user:
            await websocket.close(code=1008, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=1008, reason="Auth failed")
        return

    # Hydrate or initialize session state
    state = sessions.get(session_id, {
        "extracted_data": {},
        "missing_fields": [...],
        "history": []
    })
    sessions[session_id] = state

    # Send existing history to newly-connected client
    await websocket.send_json({
        "type": "history_sync",
        "history": state["history"],
        "extracted_data": state["extracted_data"],
        "missing_fields": state["missing_fields"]
    })

    await stream_gemini_live(
        websocket, session_id,
        on_extraction_update, on_message_completed,
        state["history"]
    )
```

---

## Part 2 — Frontend

### 2.1 The PCM AudioWorklet

The browser's `MediaRecorder` produces compressed audio. Gemini needs **raw PCM 16-bit at 16kHz**. An `AudioWorklet` runs in a dedicated audio thread and converts Float32 samples to Int16 PCM in real time.

**`/public/pcm-worklet.js`** (must be in `public/` so it's served as a static file):

```javascript
class PCMWorkletProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channel = input[0];
      const pcm16 = new Int16Array(channel.length);

      for (let i = 0; i < channel.length; i++) {
        // Clamp float32 [-1, 1] → int16 [-32768, 32767]
        const s = Math.max(-1, Math.min(1, channel[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Transfer the buffer (zero-copy) back to the main thread
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true; // keep processor alive
  }
}

registerProcessor("pcm-worklet", PCMWorkletProcessor);
```

---

### 2.2 Starting the Microphone Pipeline

```typescript
const startMic = async () => {
  // 1. Get mic stream
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  streamRef.current = stream;

  // 2. Create AudioContext at 16kHz (Gemini input sample rate)
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  audioCtxRef.current = audioCtx;

  // 3. Load the worklet module
  await audioCtx.audioWorklet.addModule('/pcm-worklet.js');
  const worklet = new AudioWorkletNode(audioCtx, 'pcm-worklet');
  workletRef.current = worklet;

  // 4. Wire mic → worklet
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(worklet);

  // 5. On each PCM chunk, encode as base64 and send over WebSocket
  worklet.port.onmessage = (e) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        audio: arrayBufferToBase64(e.data)
      }));
    }
  };
};

const stopMic = () => {
  streamRef.current?.getTracks().forEach(t => t.stop());
  sourceRef.current?.disconnect();
  workletRef.current?.disconnect();
  audioCtxRef.current?.close();
};
```

---

### 2.3 Playing Back AI Audio

The AI returns PCM 16-bit at 24kHz. We decode each chunk and queue them to play gaplessly:

```typescript
const audioQueueRef = useRef<Float32Array[]>([]);
const isPlayingRef = useRef(false);

const playPcm24k = (buffer: ArrayBuffer) => {
  const pcm16 = new Int16Array(buffer);
  const float32 = new Float32Array(pcm16.length);
  // Convert int16 → float32
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }
  audioQueueRef.current.push(float32);
  if (!isPlayingRef.current) processAudioQueue();
};

const processAudioQueue = () => {
  if (audioQueueRef.current.length === 0) {
    isPlayingRef.current = false;
    setAgentSpeaking(false);
    return;
  }
  isPlayingRef.current = true;
  setAgentSpeaking(true);

  const chunk = audioQueueRef.current.shift()!;
  // Use the same AudioContext (or create one at 24kHz for playback)
  const ctx = audioCtxRef.current || new AudioContext({ sampleRate: 24000 });

  const audioBuffer = ctx.createBuffer(1, chunk.length, 24000);
  audioBuffer.copyToChannel(chunk, 0);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.onended = () => processAudioQueue(); // chain next chunk
  source.start();
};
```

> **Why queue?** The AI streams audio in many small chunks. Playing each chunk independently causes gaps. Chaining via `onended` creates seamless playback.

---

### 2.4 WebSocket Connection & Message Routing

```typescript
const startSession = async () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(
    `${protocol}//${window.location.host}/api/ws/debrief/${sessionId}?token=${token}`
  );

  ws.onopen = async () => {
    setIsConnected(true);
    await startMic(); // start streaming mic immediately
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'history_sync':
        setMessages(msg.history || []);
        break;

      case 'input_transcript':
        // Live: what the user is saying right now
        setInputTranscript(msg.text);
        if (msg.finished) {
          setMessages(prev => [...prev, { role: 'user', text: msg.text }]);
          setInputTranscript('');
        }
        break;

      case 'output_transcript':
        // Live: what the AI is saying right now
        setOutputTranscript(msg.text);
        if (msg.finished) {
          setMessages(prev => [...prev, { role: 'agent', text: msg.text }]);
          setOutputTranscript('');
        }
        break;

      case 'audio':
        // Decode base64 → ArrayBuffer → play
        playPcm24k(base64ToArrayBuffer(msg.data));
        break;

      case 'interrupted':
        // User started talking, AI stopped — clear queue
        audioQueueRef.current = [];
        setAgentSpeaking(false);
        setOutputTranscript('');
        break;
    }
  };

  ws.onclose = () => { setIsConnected(false); stopMic(); };
};
```

---

### 2.5 Base64 Helpers

```typescript
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};
```

---

### 2.6 Vite Proxy Config

For local dev, proxy `/api` (including WebSockets) to the FastAPI backend:

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,   // <-- critical for WebSocket proxying
      },
    },
  },
});
```

---

## Part 3 — Common Gotchas

### ❌ 1007 Protocol Error — History Role Mismatch
Gemini rejects history that doesn't start with `user` or has two consecutive turns of the same role. Always run `sanitize_and_merge_history()` before replaying.

### ❌ Silent AI After Tool Call
After sending `send_tool_response()`, the session needs the AI to continue. Ensure you're using `curr_session.send_tool_response(function_responses=[...])` — the SDK handles the turn handoff correctly.

### ❌ AudioContext Autoplay Policy
Browsers block audio playback until a user gesture. Make sure `startMic()` (which creates the AudioContext) is called inside a click handler, not on mount.

### ❌ AudioWorklet Not Found
The worklet file **must** be in `/public/` (for Vite) so it's served at the root URL. It cannot be imported via ES modules — it runs in a separate AudioWorklet global scope.

### ❌ Sample Rate Mismatch
- **Input to Gemini**: 16kHz PCM (`AudioContext({ sampleRate: 16000 })`)  
- **Output from Gemini**: 24kHz PCM (create `AudioBuffer` at 24000)  
These are different. Don't mix them up.

---

## Part 4 — Env Variables

```bash
# .env
GOOGLE_API_KEY=your_gemini_api_key      # from aistudio.google.com
GEMINI_MODEL=gemini-3.1-flash-live-preview
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

---

## Quick-Start Checklist for a New Project

- [ ] Install: `google-genai`, `fastapi`, `uvicorn`, `python-dotenv`
- [ ] Set `http_options={'api_version': 'v1beta'}` on the genai Client
- [ ] Copy `pcm-worklet.js` to `public/`
- [ ] Add Vite proxy for `/api` with `ws: true`
- [ ] Build the two-task bridge (`task_from_browser` + `task_to_gemini`)
- [ ] Handle all 5 message types: `history_sync`, `input_transcript`, `output_transcript`, `audio`, `interrupted`
- [ ] Queue and chain AI audio chunks via `onended` for gapless playback
- [ ] Sanitize history before replay — must start with `user`, no consecutive same-role turns
- [ ] Pass auth token as WebSocket query param (`?token=...`)
