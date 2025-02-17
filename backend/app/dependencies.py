from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from supabase import create_client, Client
from typing import Dict, Any
from datetime import datetime, timezone
import os

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_supabase_client() -> Client:
    try:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"[ERROR] Supabase Initialization Failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize Supabase: {str(e)}")

def decode_supabase_token(token: str) -> Dict[str, Any]:
    """Decode the Supabase JWT token and check for expiration."""
    print(f"[DEBUG] Decoding token: {token}")
    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], options={"verify_aud": False})
        print(f"[DEBUG] Decoded Token Payload: {payload}")

        # Optional: Print the 'aud' claim
        if "aud" in payload:
            print(f"[DEBUG] Token Audience: {payload['aud']}")

        exp = payload.get("exp")
        if exp and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
            print("[ERROR] Token expired.")
            raise HTTPException(status_code=401, detail="Token expired")

        return payload
    except JWTError as e:
        print(f"[ERROR] JWT Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """Decode the token and retrieve the current user."""
    print("[DEBUG] Extracting current user from token.")
    payload = decode_supabase_token(token)
    user_id = payload.get("sub")
    print(f"[DEBUG] Extracted User ID: {user_id}")

    if not user_id:
        print("[ERROR] Invalid token payload, 'sub' missing.")
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user_info = await fetch_user_from_information_office(user_id)
    if user_info:
        print("[DEBUG] User found in 'Information_Office_User'.")
        return user_info

    user_guest = await fetch_user_from_guest(user_id)
    if user_guest:
        print("[DEBUG] User found in 'Guest_User'.")
        return user_guest

    print("[ERROR] User not found in either table.")
    raise HTTPException(status_code=404, detail="User not found in either table") 