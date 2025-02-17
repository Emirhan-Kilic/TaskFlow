from fastapi import APIRouter, HTTPException
from ..dependencies import get_supabase_client

router = APIRouter(tags=["health"])

@router.get("/")
def read_root():
    """Health check for the API."""
    print("[DEBUG] Root endpoint accessed.")
    return {"message": "API is running"}

@router.get("/check-connection")
async def check_connection():
    """Check the connection to Supabase and access a random row from 'information_office_user'."""
    print("[DEBUG] Checking connection to Supabase.")
    try:
        supabase = get_supabase_client()
        # Fetch a random row from 'information_office_user'
        response = supabase.table("test").select("id").limit(1).execute()
        print(f"[DEBUG] Response from 'information_office_user': {response.data}")

        # Check if response data is valid
        if response.data and isinstance(response.data, list) and len(response.data) > 0:
            return {
                "status": "Connected",
                "message": "Successfully connected to Supabase!",
            }

        raise HTTPException(status_code=500, detail="No data returned from 'information_office_user'.")
    except Exception as e:
        print(f"[ERROR] Connection Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}") 