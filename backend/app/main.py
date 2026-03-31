from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import base64
from dotenv import load_dotenv
import os
import json

# Load environment variables from .env file
load_dotenv()

from app.live_session import stream_gemini_live
from app.audio_processor import process_audio_unary
from app.schemas import SalesDebriefData

app = FastAPI(title="RIG Sales Debrief Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared session state
sessions = {}

@app.websocket("/api/ws/debrief/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    Legacy WebSocket endpoint (kept for potential fallback or live needs)
    """
    await websocket.accept()
    if session_id not in sessions:
        sessions[session_id] = {
            "extracted_data": {},
            "missing_fields": ["client_type", "portfolio_sentiment", "flight_risk", "macro_concerns", "next_steps"]
        }
    
    state = sessions[session_id]
    
    async def on_extraction_update(new_data: dict):
        state["extracted_data"].update(new_data)
        all_fields = list(SalesDebriefData.model_fields.keys())
        missing = [f for f in all_fields if f not in state["extracted_data"] or not state["extracted_data"][f]]
        state["missing_fields"] = missing
        await websocket.send_json({
            "type": "extraction_update",
            "extracted_data": state["extracted_data"],
            "missing_fields": state["missing_fields"]
        })

    try:
        await stream_gemini_live(websocket, session_id, on_extraction_update)
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

@app.post("/api/crm/sync")
async def sync_crm(payload: dict):
    # Mock CRM sync endpoint
    print(f"Syncing to CRM: {payload}")
    return {"status": "success", "message": "Synced to CRM"}
