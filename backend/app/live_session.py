import os
import asyncio
import json
import base64
import sys
import traceback
from google import genai
from google.genai import types
from dotenv import load_dotenv
from app.schemas import SalesDebriefData

load_dotenv(override=True)

MODEL_ID = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-live-preview")
if not MODEL_ID.startswith("models/"):
    MODEL_ID = f"models/{MODEL_ID}"

client = genai.Client(
    api_key=os.getenv("GOOGLE_API_KEY"),
    http_options={'api_version': 'v1beta'}
)

def sanitize_and_merge_history(raw_history):
    """
    Ensures history starts with a 'user' turn and merges any 
    consecutive turns of the same role to prevent 1007 errors.
    """
    if not raw_history:
        return []

    merged = []
    for h in raw_history:
        role = "user" if h.get("role") == "user" else "model"
        text = h.get("text", "").strip()
        if not text: continue

        if not merged:
            # 1. History must start with a 'user' turn. Drop leading model turns.
            if role != "user":
                continue
            merged.append({"role": role, "text": text})
        elif merged[-1]["role"] == role:
            # 2. Merge consecutive turns of the same role.
            merged[-1]["text"] += f"\n\n{text}"
        else:
            # 3. Normal alternating turn.
            merged.append({"role": role, "text": text})
            
    # Map the sanitized list to SDK types
    valid_turns = [
        types.Content(
            role=turn["role"], 
            parts=[types.Part.from_text(text=turn["text"])]
        ) for turn in merged
    ]
    
    return valid_turns

def save_crm_data(
    client_type: str = None,
    portfolio_sentiment: str = None,
    flight_risk: str = None,
    macro_concerns: list[str] = None,
    next_steps: str = None,
    extensive_notes: str = None
):
    data = {
        "client_type": client_type,
        "portfolio_sentiment": portfolio_sentiment,
        "flight_risk": flight_risk,
        "macro_concerns": macro_concerns,
        "next_steps": next_steps,
        "extensive_notes": extensive_notes
    }
    return {k: v for k, v in data.items() if v is not None}

async def stream_gemini_live(user_ws, session_id, on_extraction, on_message_completed, history=None):
    from asyncio import Queue
    from fastapi import WebSocketDisconnect
    
    user_outbox = Queue()
    active_gemini_session = [None]
    setup_complete_event = asyncio.Event()

    # Shared turn accumulation buffers
    session_state = {
        "current_user_text": "",
        "current_agent_text": ""
    }

    async def get_config():
        return {
            "tools": [{
                "function_declarations": [{
                    "name": "save_crm_data",
                    "description": "Saves structured CRM data extracted from the conversation.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "client_type": {"type": "string", "description": "Retail or Institutional. Omit if unknown."},
                            "portfolio_sentiment": {"type": "string", "description": "Client's feeling on portfolio. Omit if unknown."},
                            "flight_risk": {"type": "string", "description": "Risk level (Low/Medium/High). Omit if unknown."},
                            "macro_concerns": {"type": "array", "items": {"type": "string"}, "description": "Specific rants or concerns. Omit if none."},
                            "next_steps": {"type": "string", "description": "Next actions. Omit if unknown."},
                            "extensive_notes": {"type": "string", "description": "DETAILED, comprehensive notes about the conversation so far."}
                        }
                    }
                }]
            }],
            "system_instruction": {
                "parts": [{"text": (
                    "You are a meticulous junior analyst at a boutique equities firm, debriefing a senior salesperson. "
                    "Your MISSION is to capture EVERY detail of the salesperson's report in real-time. "
                    "\n\n"
                    "RULES:\n"
                    "1. INCREMENTAL UPDATES: Call 'save_crm_data' IMMEDIATELY as soon as you extract any piece of information (e.g. client type, a concern, a next step). Do NOT wait for the end of the conversation.\n"
                    "2. NO HALLUCINATIONS: Do NOT use 'Unknown', 'N/A', 'Placeholder', or dummy values. If a field hasn't been discussed yet, omit it from the 'save_crm_data' call. Only provide fields you have high confidence in.\n"
                    "3. EXTENSIVE NOTES: Maintain 'extensive_notes' as a living, cumulative record. Whenever you learn something new, call 'save_crm_data' and include the LATEST, complete version of the notes. These notes should be multi-paragraph, detailed, and capture nuances, rants, and specific quotes if possible. "
                    "4. APPEND DON'T REPLACE: If you learn more details about a field (like macro concerns), append them to the existing list instead of replacing the whole list if it remains relevant.\n"
                    "5. PERSONA: Be inquisitive, professional, and respectful. Ask follow-up questions to fill in the gaps in the CRM fields.\n"
                    "6. VERBAL ACKNOWLEDGEMENT: After every 'save_crm_data' call, you MUST briefly verbally acknowledge the data recorded (e.g., 'Got it, a retail client.') and then ask the next question.\n"
                    "7. PERSISTENCE: Do NOT end the conversation or stop asking questions until ALL fields (client_type, portfolio_sentiment, flight_risk, macro_concerns, next_steps) have been discussed and recorded."
                )}]
            },
            "generation_config": {
                "response_modalities": ["AUDIO"],
                "speech_config": {
                    "voice_config": {
                        "prebuilt_voice_config": {
                            "voice_name": "Charon"
                        }
                    }
                }
            },
            "history_config": {"initial_history_in_client_content": True},
            "input_audio_transcription": {},
            "output_audio_transcription": {},
            "realtime_input_config": {
                "automatic_activity_detection": {
                    "disabled": False,
                    "silence_duration_ms": 1000,
                }
            }
        }

    async def task_from_browser():
        try:
            while True:
                msg = await user_ws.receive_json()
                await user_outbox.put(msg)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"DEBUG: Browser read error: {e}", flush=True)

    async def gemini_receiver(curr_session):
        try:
            async for message in curr_session.receive():
                if not setup_complete_event.is_set():
                    setup_complete_event.set()

                if message.server_content:
                    sc = message.server_content
                    if sc.interrupted: 
                        await user_ws.send_json({"type": "interrupted"})
                        session_state["current_agent_text"] = ""

                    if sc.input_transcription:
                        it = sc.input_transcription
                        session_state["current_user_text"] = it.text 
                        await user_ws.send_json({
                            "type": "input_transcript", 
                            "text": it.text, 
                            "finished": bool(getattr(it, "finished", False))
                        })
                        if bool(getattr(it, "finished", False)): 
                            await on_message_completed("user", it.text)
                            session_state["current_user_text"] = ""

                    if sc.output_transcription:
                        ot = sc.output_transcription
                        session_state["current_agent_text"] = ot.text
                        await user_ws.send_json({
                            "type": "output_transcript", 
                            "text": ot.text, 
                            "finished": bool(getattr(ot, "finished", False))
                        })
                        if bool(getattr(ot, "finished", False)): 
                            await on_message_completed("agent", ot.text)
                            session_state["current_agent_text"] = ""

                    if sc.model_turn:
                        for part in sc.model_turn.parts:
                            if part.inline_data:
                                b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                                await user_ws.send_json({"type": "audio", "data": b64})
                    
                    if sc.turn_complete:
                        if session_state["current_user_text"]:
                            await user_ws.send_json({
                                "type": "input_transcript", 
                                "text": session_state["current_user_text"], 
                                "finished": True
                            })
                            await on_message_completed("user", session_state["current_user_text"])
                            session_state["current_user_text"] = ""
                        if session_state["current_agent_text"]:
                            await user_ws.send_json({
                                "type": "output_transcript", 
                                "text": session_state["current_agent_text"], 
                                "finished": True
                            })
                            await on_message_completed("agent", session_state["current_agent_text"])
                            session_state["current_agent_text"] = ""

                if message.tool_call:
                    # Force finish the user's input since the model decided to act on it
                    if session_state["current_user_text"]:
                        await user_ws.send_json({
                            "type": "input_transcript", 
                            "text": session_state["current_user_text"], 
                            "finished": True
                        })
                        await on_message_completed("user", session_state["current_user_text"])
                        session_state["current_user_text"] = ""

                    f_res = []
                    for call in message.tool_call.function_calls:
                        if call.name == "save_crm_data":
                            ext = save_crm_data(**call.args)
                            # on_extraction now returns the list of missing fields from the DB/state
                            missing = await on_extraction(ext)
                            f_res.append(types.FunctionResponse(
                                id=call.id, 
                                name=call.name, 
                                response={
                                    "status": "success", 
                                    "recorded_fields": list(ext.keys()),
                                    "remaining_missing_fields": missing
                                }
                            ))
                    if f_res: 
                        # Official SDK method handles packaging and floor yield
                        await curr_session.send_tool_response(function_responses=f_res)
        except Exception as e:
            print(f"DEBUG: Receiver error: {e}", flush=True)

    async def task_to_gemini():
        while True:
            try:
                print(f"DEBUG: Internal Re-connector: Starting for {session_id}", flush=True)
                async with client.aio.live.connect(model=MODEL_ID, config=await get_config()) as gemini_session:
                    active_gemini_session[0] = gemini_session
                    setup_complete_event.clear()
                    
                    receiver_task = asyncio.create_task(gemini_receiver(gemini_session))
                    
                    # Handshake settlement
                    await asyncio.sleep(0.05)
                    if not setup_complete_event.is_set():
                        # Force trigger by sending history or empty content
                        pass

                    if history:
                        # FIX: Sanitize the history before sending
                        valid_turns = sanitize_and_merge_history(history)
                        
                        if valid_turns:
                            print(f"DEBUG: RE-ANCHORING ({len(valid_turns)} turns)", flush=True)
                            await gemini_session.send(input=types.LiveClientContent(
                                turns=valid_turns,
                                turn_complete=True
                            ))

                    while not receiver_task.done():
                        try:
                            msg = await asyncio.wait_for(user_outbox.get(), timeout=0.1)
                            if "audio" in msg:
                                await gemini_session.send_realtime_input(audio={"mime_type": "audio/pcm;rate=16000", "data": base64.b64decode(msg["audio"])})
                            elif "text" in msg:
                                await gemini_session.send(input=msg['text'], end_of_turn=True)
                        except asyncio.TimeoutError:
                            continue
            except Exception as e:
                print(f"DEBUG: Bridge loop flicker ({e}). Retrying...", flush=True)
                await asyncio.sleep(1)

    tasks = [asyncio.create_task(task_from_browser()), asyncio.create_task(task_to_gemini())]
    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for t in tasks: t.cancel()
