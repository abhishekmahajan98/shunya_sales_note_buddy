import os
import asyncio
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

async def test_connect():
    client = genai.Client(
        api_key=os.getenv("GOOGLE_API_KEY"),
        http_options={'api_version': 'v1beta'}
    )
    try:
        print("Connecting to Gemini Live (3.1)...")
        async with client.aio.live.connect(model="gemini-3.1-flash-live-preview", config=types.LiveConnectConfig(
           response_modalities=["AUDIO"]
        )) as session:
            print("Connected successfully!")
            await session.send("Hello", end_of_turn=True)
            async for response in session.receive():
                print(f"Received: {response}")
                break
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_connect())
