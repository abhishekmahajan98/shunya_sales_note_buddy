import os
from supabase import create_client, Client
from fastapi import HTTPException, Security, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_ANON_KEY", "")

# Suppress warnings if keys are missing initially for development
if not url or not key:
    print("WARNING: SUPABASE_URL or SUPABASE_ANON_KEY not set. Auth will fail.")

supabase: Client = create_client(url, key)
security = HTTPBearer()

async def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    token = auth_header.split(" ")[1] if len(auth_header.split(" ")) > 1 else auth_header
    try:
        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid session")
        return user.user
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")

def sign_up(email: str, password: str):
    res = supabase.auth.sign_up({"email": email, "password": password})
    return res

def sign_in(email: str, password: str):
    res = supabase.auth.sign_in_with_password({"email": email, "password": password})
    return res
