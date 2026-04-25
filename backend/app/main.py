from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
import base64
from dotenv import load_dotenv
import os
import json

# Load environment variables from .env file
load_dotenv(override=True)

from app.live_session import stream_gemini_live
from app.audio_processor import process_audio_unary
from app.schemas import SalesDebriefData
from app.auth import sign_up, sign_in, get_current_user, supabase
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

app = FastAPI(title="Shunya Sales Note Buddy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared session state
sessions = {}

@app.post("/api/auth/register")
async def register(email: str, password: str):
    try:
        res = sign_up(email, password)
        return {"status": "success", "user": res.user}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login")
async def login(email: str, password: str):
    try:
        res = sign_in(email, password)
        return {"status": "success", "session": res.session, "user": res.user}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/auth/me")
async def get_me(user = Depends(get_current_user)):
    return {"status": "success", "user": user}

class SessionCreateRequest(BaseModel):
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_type: Optional[str] = None           # 'retail' | 'institutional'
    client_strategy_focus: Optional[str] = None # 'us' | 'international'
    client_region: Optional[str] = None

@app.post("/api/debrief/session")
async def create_session(body: SessionCreateRequest = SessionCreateRequest(), user = Depends(get_current_user)):
    try:
        # Create a new session record in Supabase
        res = supabase.table("sessions").insert({
            "user_id": user.id
        }).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create session")
        session_id = res.data[0]["id"]

        # Build client context from request body
        client_context = {
            "id":             body.client_id,
            "name":           body.client_name or "the client",
            "type":           body.client_type or "institutional",
            "strategy_focus": body.client_strategy_focus or "us",
            "region":         body.client_region,
        }

        # Pre-seed session in memory with client context and pre-populated client_type
        all_fields = list(SalesDebriefData.model_fields.keys())
        pre_extracted = {}
        if body.client_type:
            pre_extracted["client_type"] = body.client_type.capitalize()
        missing = [f for f in all_fields if f not in pre_extracted or not pre_extracted[f]]

        sessions[session_id] = {
            "extracted_data": pre_extracted,
            "missing_fields": missing,
            "history": [],
            "client_context": client_context,
        }

        return {"status": "success", "session_id": session_id}
    except Exception as e:
        print(f"Session Creation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/api/ws/debrief/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, token: str = None):
    """
    WebSocket endpoint with token verification.
    """
    await websocket.accept()
    
    # Simple token verification
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return
    
    try:
        user_res = supabase.auth.get_user(token)
        if not user_res or not user_res.user:
            await websocket.close(code=1008, reason="Invalid token")
            return
        user_id = user_res.user.id
    except Exception as e:
        print(f"Auth error: {e}")
        await websocket.close(code=1008, reason="Auth failed")
        return

    # Hydrate session state from DB if not already in memory
    if session_id not in sessions:
        # Fetch Extraction data and Message history in parallel
        async def fetch_session_data():
            ext_task = asyncio.to_thread(lambda: supabase.table("extractions").select("data").eq("session_id", session_id).execute())
            msg_task = asyncio.to_thread(lambda: supabase.table("messages").select("role", "content").eq("session_id", session_id).order("created_at").execute())
            return await asyncio.gather(ext_task, msg_task)

        try:
            ext_res, msg_res = await fetch_session_data()
            
            extracted_data = ext_res.data[0]["data"] if ext_res.data else {}
            history = [{"role": m["role"], "text": m["content"]} for m in msg_res.data] if msg_res.data else []
            
            all_fields = list(SalesDebriefData.model_fields.keys())
            missing = [f for f in all_fields if f not in extracted_data or not extracted_data[f]]

            sessions[session_id] = {
                "extracted_data": extracted_data,
                "missing_fields": missing,
                "history": history
            }
        except Exception as e:
            print(f"Error hydrating session {session_id}: {e}")
            sessions[session_id] = {
                "extracted_data": {},
                "missing_fields": list(SalesDebriefData.model_fields.keys()),
                "history": []
            }
    
    state = sessions[session_id]
    
    # Ensure client gets existing history on connect
    await websocket.send_json({
        "type": "history_sync",
        "history": state["history"],
        "extracted_data": state["extracted_data"],
        "missing_fields": state["missing_fields"]
    })
    
    async def on_extraction_update(new_data: dict):
        state["extracted_data"].update(new_data)
        all_fields = list(SalesDebriefData.model_fields.keys())
        missing = [f for f in all_fields if f not in state["extracted_data"] or not state["extracted_data"][f]]
        state["missing_fields"] = missing
        
        # Persist to Supabase
        try:
             supabase.table("extractions").upsert({
                 "session_id": session_id,
                 "data": state["extracted_data"]
             }, on_conflict="session_id").execute()
        except Exception as e:
            print(f"DB Error (extractions): {e}")

        await websocket.send_json({
            "type": "extraction_update",
            "extracted_data": state["extracted_data"],
            "missing_fields": state["missing_fields"]
        })
        return state["missing_fields"]

    async def on_message_completed(role: str, text: str):
        state["history"].append({"role": role, "text": text})
        
        # Persist to Supabase
        try:
             supabase.table("messages").insert({
                 "session_id": session_id,
                 "role": role,
                 "content": text
             }).execute()
        except Exception as e:
            print(f"DB Error (messages): {e}")
            
        print(f"DEBUG: Session {session_id} history grown to {len(state['history'])} turns.", flush=True)

    try:
        await stream_gemini_live(
            websocket,
            session_id,
            on_extraction_update,
            on_message_completed,
            state["history"],
            client_context=state.get("client_context"),
        )
    except WebSocketDisconnect:
        print(f"Client disconnected: {session_id}")
    except Exception as e:
        print(f"WebSocket Proxy Error: {e}")

@app.post("/api/debrief/process/{session_id}")
async def process_audio(session_id: str, audio: UploadFile = File(...)):
    """
    HTTP Walkie-Talkie endpoint with conversation history support.
    """
    if session_id not in sessions:
        sessions[session_id] = {
            "extracted_data": {},
            "history": [], # Store the conversation context (Content objects)
            "missing_fields": ["client_type", "portfolio_sentiment", "flight_risk", "macro_concerns", "next_steps"]
        }
    
    state = sessions[session_id]
    audio_content = await audio.read()
    
    # Process with the history list
    result = await process_audio_unary(audio_content, state["history"])
    
    # Update local state with new extraction and context
    state["extracted_data"].update(result["extractions"])
    state["history"] = result["history"]
    
    all_fields = list(SalesDebriefData.model_fields.keys())
    state["missing_fields"] = [f for f in all_fields if f not in state["extracted_data"] or not state["extracted_data"][f]]
    
    return {
        "status": "success",
        "text": result["text"],
        "extracted_data": state["extracted_data"],
        "audio": result["audio"], # Native professional voice
        "missing_fields": state["missing_fields"]
    }

@app.post("/api/debrief/clear/{session_id}")
async def clear_session(session_id: str, user = Depends(get_current_user)):
    """
    Clear the session state for a given session ID.
    """
    # Clear DB data first
    try:
        supabase.table("messages").delete().eq("session_id", session_id).execute()
        supabase.table("extractions").delete().eq("session_id", session_id).execute()
    except Exception as e:
        print(f"DB Clear Error: {e}")

    if session_id in sessions:
        sessions[session_id] = {
            "extracted_data": {},
            "history": [],
            "missing_fields": ["client_type", "portfolio_sentiment", "flight_risk", "macro_concerns", "next_steps", "extensive_notes"]
        }
    return {"status": "success", "message": f"Session {session_id} cleared"}

@app.post("/api/crm/sync")
async def sync_crm(payload: dict):
    # Mock CRM sync endpoint
    print(f"Syncing to CRM: {payload}")
    return {"status": "success", "message": "Synced to CRM"}

# ── Frontend Static Serving ────────────────────────────────────────────────────

# Serve frontend static files at root path
# This must be LAST so API routes take precedence
frontend_dist = Path(__file__).parent / "static"

if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")

    # Catch-all route for any non-API routes to serve index.html (React Router)
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # If the path is under /api, return 404
        if full_path.startswith("api"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="API route not found")
        return FileResponse(frontend_dist / "index.html")
