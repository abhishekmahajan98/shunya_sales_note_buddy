import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

print("Supported models for Bidi (Live API):")
for m in client.models.list():
    if 'bidiGenerateContent' in m.supported_generation_methods:
        print(f"- {m.name}")
