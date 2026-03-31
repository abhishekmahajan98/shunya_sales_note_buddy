import os
import base64
from google import genai
from google.genai import types
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential

load_dotenv()

# Use the benchmark stable model for unary audio processing
MODEL_ID = "gemini-2.0-flash"

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
    Saves structured CRM data extracted from the conversation.
    """
    data = {
        "client_type": client_type,
        "portfolio_sentiment": portfolio_sentiment,
        "flight_risk": flight_risk,
        "macro_concerns": macro_concerns,
        "next_steps": next_steps
    }
    return {k: v for k, v in data.items() if v is not None}

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True
)
async def process_audio_unary(audio_bytes: bytes, history: list):
    """
    Sends binary audio to Gemini via standard HTTP Unary (generate_content)
    with conversation history and returns extraction results and text response.
    Includes exponential backoff for 429 rate limiting.
    """
    
    # 1. Define the tools
    tools = [types.Tool(
        function_declarations=[types.FunctionDeclaration(
            name="save_crm_data",
            description="Saves structured CRM data extracted from the conversation.",
            parameters={
                "type": "OBJECT",
                "properties": {
                    "client_type": {"type": "string", "description": "Retail or Institutional"},
                    "portfolio_sentiment": {"type": "string", "description": "Client's feeling on portfolio"},
                    "flight_risk": {"type": "string", "description": "Risk level (Low/Medium/High)"},
                    "macro_concerns": {"type": "array", "items": {"type": "string"}},
                    "next_steps": {"type": "string", "description": "Next actions"},
                    "extensive_notes": {"type": "string", "description": "Comprehensive, detailed notes of the entire debrief turn"}
                }
            }
        )]
    )]

    system_instr = (
        "You are a highly competent, professional Sales Strategy Partner. "
        "Your goal is to help the salesperson structure their debrief and capture every valuable insight for the CRM. "
        "### CORE CONSTRAINTS ### "
        "1. NO HALLUCINATIONS: Do not invent client names, project names (like 'Project Phoenix'), or deal statuses. Use ONLY what is explicitly mentioned. "
        "2. TONE: Be professional, supportive, and intellectually inquisitive. You are a collaborative partner, not an interrogator. "
        "3. TRANSCRIPTION: Always start with 'USER_TRANSCRIPT: [exact words heard]'. "
        "4. DETAILED EXTRACTION: While your spoken response should be conversational, the 'extensive_notes' field in the tool must remain deeply analytical and thorough (aim for high detail). "
        "5. CURIOSITY: Ask 1-2 thoughtful follow-up questions to help the user uncover more detail about the client's needs or the next steps. "
        "### PERSONALITY ### "
        "You are a helpful analyst who values accuracy above all else. If information is missing, simply ask for it politely rather than assuming."
    )

    # Convert binary audio to a Part
    current_audio_part = types.Part.from_bytes(data=audio_bytes, mime_type="audio/webm")

    # 2. Build contents (History + New Audio)
    contents = history + [types.Content(role="user", parts=[current_audio_part])]

    # 3. Call Gemini Unary - Reverted to text-only output for stability
    response = client.models.generate_content(
        model=MODEL_ID,
        config=types.GenerateContentConfig(
            tools=tools,
            system_instruction=system_instr
            # response_modalities=["AUDIO"] # NOT SUPPORTED in Unary yet
        ),
        contents=contents
    )

    new_extractions = {}
    response_text = ""
    user_transcript = ""
    response_audio_b64 = None

    # 4. Process response parts
    if response.candidates:
        candidate = response.candidates[0]
        model_parts = []
        for part in candidate.content.parts:
            if part.text:
                full_text = part.text
                if "USER_TRANSCRIPT:" in full_text:
                    parts = full_text.split("USER_TRANSCRIPT:", 1)[1].split("\n", 1)
                    user_transcript = parts[0].strip()
                    response_text = parts[1].strip() if len(parts) > 1 else "Received."
                else:
                    # Fallback: if tag is missing
                    response_text += full_text
                model_parts.append(types.Part(text=part.text))
                
            if part.inline_data:
                # Capture the native professional voice byte string
                response_audio_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                model_parts.append(part)
                
            if part.function_call:
                model_parts.append(part)
                if part.function_call.name == "save_crm_data":
                    new_extractions.update(part.function_call.args)
        
        # history update
        history.append(types.Content(role="user", parts=[types.Part(text=user_transcript)]))
        history.append(types.Content(role="model", parts=model_parts))

    return {
        "user_text": user_transcript,
        "text": response_text or "Got it.",
        "extractions": new_extractions,
        "audio": response_audio_b64, # High-quality native voice data
        "history": history
    }
