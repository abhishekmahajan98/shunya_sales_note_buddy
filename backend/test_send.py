import asyncio
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

async def test_connect():
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"), http_options={'api_version': 'v1beta'})
    async with client.aio.live.connect(model="gemini-3.1-flash-live-preview", config=types.LiveConnectConfig(response_modalities=["AUDIO"])) as session:
        print("Connected.")
        try:
            await session.send(input="Hello")
            print("send(input=...) works.")
        except Exception as e:
            print(f"Error 1: {e}")
            
        async for response in session.receive():
            print("Got response")
            break

asyncio.run(test_connect())
