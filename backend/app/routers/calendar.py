from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime, timedelta

router = APIRouter(prefix="/calendar", tags=["calendar"])

class CalendarEvent(BaseModel):
    task_id: str
    external_id: str
    start_time: str
    end_time: str
    service_type: str = "google"
    sync_token: Optional[str] = None
    user_id: int

@router.get("/events")
async def get_calendar_events(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    response = supabase.table("calendar_events").select("""
        id,
        task_id,
        external_id,
        start_time,
        end_time,
        tasks (
            title
        )
    """).eq("user_id", current_user["id"]).eq("service_type", "google").execute()
    
    if hasattr(response, 'error') and response.error:
        raise HTTPException(status_code=400, detail=str(response.error))
    return response.data

@router.post("/events")
async def create_calendar_event(event: CalendarEvent, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    response = supabase.table("calendar_events").insert({
        **event.dict(),
        "last_synced": datetime.now().isoformat()
    }).execute()
    
    if hasattr(response, 'error') and response.error:
        raise HTTPException(status_code=400, detail=str(response.error))
    return response.data

@router.delete("/events/{external_id}")
async def delete_calendar_event(external_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    response = supabase.table("calendar_events").delete().eq("external_id", external_id).execute()
    
    if hasattr(response, 'error') and response.error:
        raise HTTPException(status_code=400, detail=str(response.error))
    return response.data

@router.get("/deadlines")
async def get_upcoming_deadlines(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    
    # Get tasks due in the next 7 days
    today = datetime.now()
    week_later = today + timedelta(days=7)
    
    response = supabase.table("tasks").select("*").gte("due_date", today).lte("due_date", week_later).execute()
    return response.data 