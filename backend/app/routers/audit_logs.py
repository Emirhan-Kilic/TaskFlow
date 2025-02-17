from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from ..dependencies import get_current_user, get_db
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime, timedelta

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

class AuditLogEntry(BaseModel):
    action: str
    entity_type: str
    entity_id: int
    metadata: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

class AuditLogResponse(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: int
    user_id: int
    metadata: Dict[str, Any]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    user: Dict[str, Any]  # Contains user details

    class Config:
        orm_mode = True

@router.get("/", response_model=List[AuditLogResponse])
async def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get audit logs with various filters.
    Only administrators can access this endpoint.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view audit logs")
    
    query = db.query(models.AuditLog).join(models.User)
    
    if entity_type:
        query = query.filter(models.AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(models.AuditLog.entity_id == entity_id)
    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)
    if action:
        query = query.filter(models.AuditLog.action == action)
    if start_date:
        query = query.filter(models.AuditLog.created_at >= start_date)
    if end_date:
        query = query.filter(models.AuditLog.created_at <= end_date)
    
    total = query.count()
    
    logs = query.order_by(models.AuditLog.created_at.desc())\
                .offset(offset)\
                .limit(limit)\
                .all()
    
    return logs

@router.get("/summary", response_model=Dict[str, Any])
async def get_audit_logs_summary(
    days: int = Query(7, ge=1, le=30),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a summary of audit log activities for the specified number of days.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view audit logs summary")
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get action counts
    action_counts = db.query(
        models.AuditLog.action,
        func.count(models.AuditLog.id).label('count')
    ).filter(
        models.AuditLog.created_at >= start_date
    ).group_by(models.AuditLog.action).all()
    
    # Get entity type counts
    entity_counts = db.query(
        models.AuditLog.entity_type,
        func.count(models.AuditLog.id).label('count')
    ).filter(
        models.AuditLog.created_at >= start_date
    ).group_by(models.AuditLog.entity_type).all()
    
    # Get user activity counts
    user_counts = db.query(
        models.User.id,
        models.User.display_name,
        func.count(models.AuditLog.id).label('count')
    ).join(models.AuditLog).filter(
        models.AuditLog.created_at >= start_date
    ).group_by(models.User.id).order_by(func.count(models.AuditLog.id).desc()).limit(10).all()
    
    return {
        "action_counts": {action: count for action, count in action_counts},
        "entity_counts": {entity: count for entity, count in entity_counts},
        "top_users": [{"id": id, "name": name, "count": count} for id, name, count in user_counts],
        "total_logs": sum(count for _, count in action_counts)
    }

@router.get("/{log_id}", response_model=AuditLogResponse)
async def get_audit_log(
    log_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a specific audit log entry by ID.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view audit logs")
    
    log = db.query(models.AuditLog).filter(models.AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    return log

@router.post("/", response_model=AuditLogResponse)
async def create_audit_log(
    entry: AuditLogEntry,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new audit log entry.
    This endpoint is typically called internally by other endpoints.
    """
    log = models.AuditLog(
        **entry.dict(),
        user_id=current_user["id"],
        created_at=datetime.utcnow()
    )
    
    db.add(log)
    db.commit()
    db.refresh(log)
    
    return log

@router.get("/entity/{entity_type}/{entity_id}", response_model=List[AuditLogResponse])
async def get_entity_audit_logs(
    entity_type: str,
    entity_id: int,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all audit logs for a specific entity.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view audit logs")
    
    logs = db.query(models.AuditLog).filter(
        models.AuditLog.entity_type == entity_type,
        models.AuditLog.entity_id == entity_id
    ).order_by(models.AuditLog.created_at.desc())\
    .offset(offset)\
    .limit(limit)\
    .all()
    
    return logs

@router.get("/user/{user_id}", response_model=List[AuditLogResponse])
async def get_user_audit_logs(
    user_id: int,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all audit logs created by a specific user.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view audit logs")
    
    logs = db.query(models.AuditLog).filter(
        models.AuditLog.user_id == user_id
    ).order_by(models.AuditLog.created_at.desc())\
    .offset(offset)\
    .limit(limit)\
    .all()
    
    return logs 