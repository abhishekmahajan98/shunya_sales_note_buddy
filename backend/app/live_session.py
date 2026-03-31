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

load_dotenv()

# Switching to the industry-standard stable model for Live Multimodal
MODEL_ID = "models/gemini-2.0-flash-exp"

# Initialize the GenAI client
client = genai.Client(
    api_key=os.getenv("GOOGLE_API_KEY"),
    http_options={'api_version': 'v1beta'}
)

def save_crm_data(
    client_type: str = None,
    portfolio_sentiment: str = None,
    flight_risk: str = None,
    macro_concerns: list[str] = None,
    next_steps: str = None
):
    """
    Saves structured CRM data extracted from the sales debrief conversation.
    """
    data = {
        "client_type": client_type,
        "portfolio_sentiment": portfolio_sentiment,
        "flight_risk": flight_risk,
        "macro_concerns": macro_concerns,
        "next_steps": next_steps
    }
    return {k: v for k, v in data.items() if v is not None}

async def stream_gemini_live(user_ws, session_id, on_extraction):
    """
    Bridge between the Client WebSocket and Gemini Multimodal Live API.
    Refactored for maximum resilience with traceback tracking.
    """
    print(f"DEBUG: Starting stream_gemini_live for {session_id}", flush=True)
    config = types.LiveConnectConfig(
        tools=[{
            "function_declarations": [
                {
                    "name": "save_crm_data",
                    "description": "Saves structured CRM data extracted from the conversation.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "client_type": {"type": "string", "description": "Retail or Institutional"},
                            "portfolio_sentiment": {"type": "string", "description": "Client's feeling on portfolio"},
                            "flight_risk": {"type": "string", "description": "Risk level (Low/Medium/High)"},
                            "macro_concerns": {"type": "array", "items": {"type": "string"}},
                            "next_steps": {"type": "string", "description": "Next actions"}
                        }
                    }
                }
            ]
        }],
        system_instruction=types.Content(
            parts=[types.Part(text=(
                "You are a junior analyst at a boutique long-only equities firm, debriefing a senior salesperson. "
                "Your goal is to extract structured CRM data (client type, sentiment, flight risk, macro concerns, next steps). "
                "Keep your responses brief and natural. Call the 'save_crm_data' tool whenever you hear relevant info."
            ))]
        ),
        generation_config=types.GenerationConfig(
             response_modalities=["AUDIO"]
        )
    )

    try:
        print(f"DEBUG: Attempting to connect to {MODEL_ID}...", flush=True)
        async with client.aio.live.connect(model=MODEL_ID, config=config) as gemini_session:
            print(f"DEBUG: Connected to Gemini Live for session {session_id}", flush=True)

            async def receive_from_gemini():
                """Task to handle incoming messages from Gemini."""
                try:
                    async for message in gemini_session.receive():
                        try:
                            if message.server_content is not None:
                                if message.server_content.interrupted:
                                    print("DEBUG: Gemini says INTERRUPTED", flush=True)
                                    await user_ws.send_json({"type": "interrupted"})
                                
                                model_turn = message.server_content.model_turn
                                if model_turn:
                                    for part in model_turn.parts:
                                        if part.inline_data:
                                            audio_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                                            await user_ws.send_json({"type": "audio", "data": audio_b64})
                                        if part.text:
                                            print(f"DEBUG: Gemini Text: {part.text}", flush=True)
                                            await user_ws.send_json({"type": "transcript", "role": "agent", "text": part.text})

                            if message.tool_call:
                                print(f"DEBUG: Tool Call detected: {message.tool_call}", flush=True)
                                for call in message.tool_call.function_calls:
                                    if call.name == "save_crm_data":
                                        try:
                                            extracted = save_crm_data(**call.args)
                                            print(f"DEBUG: Extraction sync: {extracted}", flush=True)
                                            await on_extraction(extracted)
                                            
                                            await gemini_session.send_tool_response(
                                                function_responses=[{
                                                    "id": call.id,
                                                    "name": call.name,
                                                    "response": {"result": extracted}
                                                }]
                                            )
                                            print(f"DEBUG: Sent tool response back for {call.id}", flush=True)
                                        except Exception as te:
                                            print(f"DEBUG: Tool handling error:\n{traceback.format_exc()}", flush=True)
                            
                            await asyncio.sleep(0.01)
                        except Exception as inner_e:
                            print(f"DEBUG: Message processing error:\n{traceback.format_exc()}", flush=True)
                            break
                            
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"DEBUG: receiver task died:\n{traceback.format_exc()}", flush=True)

            async def send_to_gemini():
                """Task to handle outgoing messages from User to Gemini."""
                audio_count = 0
                try:
                    from fastapi import WebSocketDisconnect
                    while True:
                        try:
                            message = await user_ws.receive_json()
                            if "audio" in message:
                                audio_count += 1
                                if audio_count % 100 == 0:
                                    print(f"DEBUG: Proxied {audio_count} audio chunks from User", flush=True)
                                
                                audio_bytes = base64.b64decode(message["audio"])
                                await gemini_session.send_realtime_input(
                                    audio={"mime_type": "audio/pcm;rate=16000", "data": audio_bytes}
                                )
                            elif message.get("type") == "end_turn":
                                print(f"DEBUG: User clicked STOP. Sending forced turn signal.", flush=True)
                                # 3.1 Preview requires a non-empty turns list to avoid 1007 error
                                await gemini_session.send_client_content(
                                    turns=[types.Content(role="user", parts=[types.Part(text=".")])],
                                    turn_complete=True
                                )
                            elif "text" in message:
                                print(f"DEBUG: User typing: {message['text']}", flush=True)
                                await gemini_session.send_client_content(
                                    turns=[types.Content(role="user", parts=[types.Part(text=message['text'])])],
                                    turn_complete=True
                                )
                        except WebSocketDisconnect as d:
                            print(f"DEBUG: Browser disconnected (Code {d.code})", flush=True)
                            break
                        except Exception as inner_e:
                            print(f"DEBUG: send loop error:\n{traceback.format_exc()}", flush=True)
                            break
                        await asyncio.sleep(0.01)
                except Exception as e:
                    print(f"DEBUG: sender task died:\n{traceback.format_exc()}", flush=True)

            # Start tasks independently with names
            rt = asyncio.create_task(receive_from_gemini(), name="GeminiReceiver")
            st = asyncio.create_task(send_to_gemini(), name="UserSender")

            # Wait for either to finish
            done, pending = await asyncio.wait([rt, st], return_when=asyncio.FIRST_COMPLETED)
            
            # Diagnostic for which one finished
            for finished in done:
                print(f"DEBUG: Task {finished.get_name()} finished session {session_id}.", flush=True)

            for t in pending: t.cancel()
            print(f"DEBUG: Session {session_id} cleanup complete.", flush=True)

    except Exception as e:
        print(f"CRITICAL: stream_gemini_live failed to initialize:\n{traceback.format_exc()}", flush=True)
