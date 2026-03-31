import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

print("Listing all models and supported methods:")
for m in genai.list_models():
    print(f"- {m.name} | Methods: {m.supported_generation_methods}")
