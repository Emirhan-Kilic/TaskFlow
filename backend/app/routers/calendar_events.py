from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from ..dependencies import get_current_user, get_db, get_supabase_client
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta

router = APIRouter(prefix="/calendar-events", tags=["calendar-events"])

class CalendarEventBase(BaseModel):
    task_id: str
    external_id: str
    start_time: str
    end_time: str
    service_type: str = 'google'
    sync_token: Optional[str] = None

class CalendarEventCreate(CalendarEventBase):
    pass

class CalendarEventResponse(CalendarEventBase):
    id: int
    last_synced: Optional[datetime]
    created_at: datetime
    task: Optional[dict]  # Include related task information

    class Config:
        orm_mode = True

@router.get("/")
async def get_calendar_events(
    task_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("calendar_events").select("""
        *,
        tasks (
            id,
            title,
            description
        )
    """).eq("user_id", current_user["id"])
    
    if task_id:
        query = query.eq("task_id", task_id)
    
    response = query.execute()
    return response.data

@router.post("/")
async def create_calendar_event(
    event: CalendarEventBase,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("calendar_events").insert({
        **event.dict(),
        "user_id": current_user["id"],
        "created_at": datetime.now().isoformat()
    }).execute()
    return response.data

@router.delete("/{external_id}")
async def delete_calendar_event(
    external_id: str,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    
    # Verify ownership
    event = supabase.table("calendar_events")\
        .select("user_id")\
        .eq("external_id", external_id)\
        .single()\
        .execute()
    
    if not event.data or event.data["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")
    
    response = supabase.table("calendar_events")\
        .delete()\
        .eq("external_id", external_id)\
        .execute()
    
    return response.data

@router.get("/", response_model=List[CalendarEventResponse])
async def get_calendar_events_db(
    user_id: Optional[int] = None,
    task_id: Optional[int] = None,
    service_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get calendar events with optional filtering"""
    query = db.query(models.CalendarEvent).join(models.Task)
    
    # Apply filters
    if user_id:
        query = query.filter(models.CalendarEvent.user_id == user_id)
    if task_id:
        query = query.filter(models.CalendarEvent.task_id == task_id)
    if service_type:
        query = query.filter(models.CalendarEvent.service_type == service_type)
    if start_date:
        query = query.filter(models.CalendarEvent.start_time >= start_date)
    if end_date:
        query = query.filter(models.CalendarEvent.end_time <= end_date)
    
    # Ensure user can only see events from their department
    query = query.filter(models.Task.department_id == current_user["department_id"])
    
    return query.order_by(models.CalendarEvent.start_time.desc())\
                .offset(offset)\
                .limit(limit)\
                .all()

@router.post("/", response_model=CalendarEventResponse)
async def create_calendar_event_db(
    event: CalendarEventCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new calendar event"""
    # Verify task exists and user has access
    task = db.query(models.Task).filter(
        models.Task.id == event.task_id,
        models.Task.department_id == current_user["department_id"]
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Create event
    db_event = models.CalendarEvent(
        **event.dict(),
        last_synced=datetime.utcnow(),
        created_at=datetime.utcnow()
    )
    
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    
    return db_event

@router.get("/{event_id}", response_model=CalendarEventResponse)
async def get_calendar_event(
    event_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific calendar event"""
    event = db.query(models.CalendarEvent).join(models.Task).filter(
        models.CalendarEvent.id == event_id,
        models.Task.department_id == current_user["department_id"]
    ).first()
    
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    
    return event

@router.put("/{event_id}", response_model=CalendarEventResponse)
async def update_calendar_event(
    event_id: int,
    event: CalendarEventCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a calendar event"""
    db_event = db.query(models.CalendarEvent).join(models.Task).filter(
        models.CalendarEvent.id == event_id,
        models.Task.department_id == current_user["department_id"]
    ).first()
    
    if not db_event:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    
    # Update event fields
    for field, value in event.dict().items():
        setattr(db_event, field, value)
    db_event.last_synced = datetime.utcnow()
    
    db.commit()
    db.refresh(db_event)
    
    return db_event

@router.delete("/{event_id}")
async def delete_calendar_event_db(
    event_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a calendar event"""
    event = db.query(models.CalendarEvent).join(models.Task).filter(
        models.CalendarEvent.id == event_id,
        models.Task.department_id == current_user["department_id"]
    ).first()
    
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    
    db.delete(event)
    db.commit()
    
    return {"message": "Event deleted successfully"}

@router.post("/sync", response_model=List[CalendarEventResponse])
async def sync_calendar_events(
    service_type: str,
    sync_token: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sync calendar events with external service"""
    events = db.query(models.CalendarEvent).filter(
        models.CalendarEvent.service_type == service_type,
        models.CalendarEvent.user_id == current_user["id"]
    )
    
    if sync_token:
        events = events.filter(models.CalendarEvent.sync_token != sync_token)
    
    events = events.all()
    
    # Update sync status
    for event in events:
        event.last_synced = datetime.utcnow()
        event.sync_token = sync_token
    
    db.commit()
    
    return events

@router.get("/user/{user_id}/upcoming", response_model=List[CalendarEventResponse])
async def get_upcoming_events(
    user_id: int,
    days: int = Query(7, ge=1, le=30),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get upcoming calendar events for a user"""
    if current_user["id"] != user_id and current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Cannot access other users' events")
    
    end_date = datetime.utcnow() + timedelta(days=days)
    
    events = db.query(models.CalendarEvent).join(models.Task).filter(
        models.CalendarEvent.user_id == user_id,
        models.CalendarEvent.start_time >= datetime.utcnow(),
        models.CalendarEvent.start_time <= end_date,
        models.Task.department_id == current_user["department_id"]
    ).order_by(models.CalendarEvent.start_time.asc()).all()
    
    return events 