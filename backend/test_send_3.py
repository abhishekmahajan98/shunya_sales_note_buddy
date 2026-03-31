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
            # How to send audio?
            await session.send_realtime_input([{"data": b"", "mime_type": "audio/pcm;rate=16000"}])
            print("send_realtime_input works.")
        except Exception as e:
            print(f"Error realtime: {e}")

        try:
            # How to send client content?
            await session.send_client_content([{"text": "hello"}])
            print("send_client_content works.")
        except Exception as e:
            print(f"Error text: {e}")

asyncio.run(test_connect())
