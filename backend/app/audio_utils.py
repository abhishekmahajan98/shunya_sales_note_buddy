import os
import tempfile
from dotenv import load_dotenv
import google.generativeai as genai
from google.cloud import texttospeech

# Load environment variables from .env file
load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
gemini_model = genai.GenerativeModel("gemini-3-flash-preview")

async def transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribes audio using Gemini 1.5 Flash's multimodal capabilities."""
    if not audio_bytes:
        return ""
        
    try:
        # Use Gemini to transcribe the audio
        # Note: In a production app, we'd handle the file with a more robust staging, 
        # but for this debrief agent, sending inline bytes/temp files works.
        with tempfile.NamedTemporaryFile(delete=True, suffix=".wav") as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio.seek(0)
            
            # Create a generative content part for the audio
            # Using the genai SDK directly for multimodal input
            response = gemini_model.generate_content([
                "Transcribe the following audio recording of a sales debrief. Only output the transcription text.",
                {"mime_type": "audio/wav", "data": audio_bytes}
            ])
            return response.text.strip()
    except Exception as e:
        print(f"Gemini Transcription error: {e}")
        return ""

async def generate_audio(text: str) -> bytes:
    """Generates speech from text using Google Cloud Text-to-Speech."""
    if not text:
        return b""
        
    try:
        # Check if we have credentials for GCloud TTS, otherwise fallback or skip
        # Note: This requires GOOGLE_APPLICATION_CREDENTIALS or default auth
        client = texttospeech.TextToSpeechClient()
        
        input_text = texttospeech.SynthesisInput(text=text)
        
        # Configure the voice request
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Neural2-F", # Modern neutral female voice
            ssml_gender=texttospeech.SsmlVoiceGender.FEMALE,
        )
        
        # Select the type of audio file you want returned
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )
        
        response = client.synthesize_speech(
            request={"input": input_text, "voice": voice, "audio_config": audio_config}
        )
        
        return response.audio_content
    except Exception as e:
        print(f"Google TTS error: {e}")
        # If GCloud TTS fails (e.g. no auth), we might need a fallback or just return empty
        return b""


