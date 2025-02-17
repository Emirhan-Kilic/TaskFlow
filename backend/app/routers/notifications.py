from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from sqlalchemy import or_, and_
from ..database import get_db
from . import models, schemas
from ..auth import get_current_user
from ..utils.notifications import send_push_notification
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel

router = APIRouter(prefix="/notifications", tags=["notifications"])

class NotificationBase(BaseModel):
    user_id: int
    task_id: Optional[int] = None
    type: str  # Using notification_type_enum: 'email', 'sms', 'push'
    subject: str
    message: str
    is_read: bool = False
    created_at: Optional[datetime] = None

@router.get("/")
async def get_notifications(
    user_id: Optional[int] = None,
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("notifications").select("""
        id,
        user_id,
        task_id,
        type,
        subject,
        message,
        is_read,
        created_at,
        task:task_id (
            title,
            priority
        )
    """).order("created_at", {"ascending": False})
    
    if user_id:
        query = query.eq("user_id", user_id)
    if unread_only:
        query = query.eq("is_read", False)
    
    response = query.execute()
    return response.data

@router.post("/")
async def create_notification(
    notification: NotificationBase,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("notifications").insert({
        **notification.dict(),
        "created_at": datetime.now().isoformat()
    }).execute()
    return response.data

@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("notifications")\
        .update({"is_read": True})\
        .eq("id", notification_id)\
        .execute()
    return response.data

@router.put("/read-all")
async def mark_all_notifications_read(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("notifications")\
        .update({"is_read": True})\
        .eq("user_id", user_id)\
        .eq("is_read", False)\
        .execute()
    return response.data

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    current_user: dict = Depends(get_current_user)
):
    # Verify ownership or admin status
    if current_user["role"] != "admin":
        supabase = get_supabase_client()
        notification = supabase.table("notifications")\
            .select("user_id")\
            .eq("id", notification_id)\
            .single()\
            .execute()
        
        if not notification.data or notification.data["user_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized to delete this notification")
    
    response = supabase.table("notifications")\
        .delete()\
        .eq("id", notification_id)\
        .execute()
    return response.data

@router.get("/unread-count", response_model=schemas.UnreadCount)
async def get_unread_count(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get count of unread notifications"""
    count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read.is_(False)
    ).count()
    
    return {"count": count}

@router.get("/task/{task_id}", response_model=List[schemas.NotificationResponse])
async def get_task_notifications(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get all notifications related to a specific task"""
    notifications = db.query(models.Notification).filter(
        models.Notification.task_id == task_id,
        or_(
            models.Notification.user_id == current_user.id,
            and_(
                models.Task.id == task_id,
                models.Task.created_by == current_user.id
            )
        )
    ).order_by(models.Notification.created_at.desc()).all()
    
    return notifications

@router.post("/bulk", response_model=List[schemas.NotificationResponse])
async def create_bulk_notifications(
    notifications: List[schemas.NotificationCreate],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Create multiple notifications at once"""
    db_notifications = []
    current_time = datetime.utcnow()
    
    for notification in notifications:
        db_notification = models.Notification(
            **notification.dict(),
            created_at=current_time
        )
        db.add(db_notification)
        db_notifications.append(db_notification)
        
        # Queue push notifications
        if notification.type == 'push':
            background_tasks.add_task(
                send_push_notification,
                user_id=notification.user_id,
                title=notification.subject,
                body=notification.message
            )
    
    db.commit()
    for notification in db_notifications:
        db.refresh(notification)
    
    return db_notifications

@router.get("/department/{department_id}")
async def get_department_notifications(
    department_id: int,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Get notifications for all tasks in a department"""
    supabase = get_supabase_client()
    
    # First get all tasks for the department
    tasks = supabase.table("tasks").select("id").eq("department_id", department_id).execute()
    task_ids = [task["id"] for task in tasks.data]
    
    if not task_ids:
        return []
    
    query = supabase.table("notifications").select("""
        *,
        task:task_id (
            title,
            priority,
            department_id,
            due_date
        )
    """).in_("task_id", task_ids)\
        .order("created_at", {"ascending": False})\
        .range(offset, offset + limit)
    
    response = query.execute()
    return response.data

@router.get("/metrics")
async def get_notification_metrics(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get metrics about notifications (counts by type, read/unread ratio, etc.)"""
    supabase = get_supabase_client()
    query = supabase.table("notifications").select("*")
    
    if start_date:
        query = query.gte("created_at", start_date.isoformat())
    if end_date:
        query = query.lte("created_at", end_date.isoformat())
    
    response = query.execute()
    
    # Calculate metrics
    notifications = response.data
    total = len(notifications)
    read = sum(1 for n in notifications if n["is_read"])
    unread = total - read
    
    type_counts = {}
    for n in notifications:
        type_counts[n["type"]] = type_counts.get(n["type"], 0) + 1
    
    return {
        "total": total,
        "read": read,
        "unread": unread,
        "read_ratio": read/total if total > 0 else 0,
        "type_distribution": type_counts
    }

@router.delete("/bulk")
async def delete_bulk_notifications(
    notification_ids: List[int],
    current_user: dict = Depends(get_current_user)
):
    """Delete multiple notifications at once"""
    supabase = get_supabase_client()
    
    # Verify ownership or admin status
    if current_user["role"] != "admin":
        notifications = supabase.table("notifications")\
            .select("id,user_id")\
            .in_("id", notification_ids)\
            .execute()
        
        # Check if all notifications belong to the user
        if not all(n["user_id"] == current_user["id"] for n in notifications.data):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to delete some of these notifications"
            )
    
    response = supabase.table("notifications")\
        .delete()\
        .in_("id", notification_ids)\
        .execute()
    
    return response.data

@router.put("/mark-bulk-read")
async def mark_bulk_notifications_read(
    notification_ids: List[int],
    current_user: dict = Depends(get_current_user)
):
    """Mark multiple notifications as read"""
    supabase = get_supabase_client()
    
    response = supabase.table("notifications")\
        .update({"is_read": True})\
        .in_("id", notification_ids)\
        .eq("user_id", current_user["id"])\
        .execute()
    
    return response.data 