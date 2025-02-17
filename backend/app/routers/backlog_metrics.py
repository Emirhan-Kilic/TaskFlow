from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from ..dependencies import get_current_user, get_db
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy import func
from backend.models import BacklogMetric as BacklogMetricModel

router = APIRouter(prefix="/backlog-metrics", tags=["backlog-metrics"])

class BacklogMetricBase(BaseModel):
    department_id: int
    overdue_tasks: int = 0
    high_priority_tasks: int = 0
    avg_delay: timedelta

class BacklogMetricResponse(BacklogMetricBase):
    id: int
    measured_at: datetime

    class Config:
        orm_mode = True

@router.get("/", response_model=List[BacklogMetricResponse])
async def get_backlog_metrics(
    department_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get backlog metrics with optional filtering"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    query = db.query(BacklogMetricModel)
    
    # Apply filters
    if department_id:
        query = query.filter(BacklogMetricModel.department_id == department_id)
    elif current_user["role"] != "admin":
        # Non-admin users can only see their department's metrics
        query = query.filter(BacklogMetricModel.department_id == current_user["department_id"])
    
    if start_date:
        query = query.filter(BacklogMetricModel.measured_at >= start_date)
    if end_date:
        query = query.filter(BacklogMetricModel.measured_at <= end_date)
    
    return query.order_by(BacklogMetricModel.measured_at.desc())\
                .offset(offset)\
                .limit(limit)\
                .all()

@router.get("/latest", response_model=BacklogMetricResponse)
async def get_latest_backlog_metric(
    department_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the most recent backlog metric"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    query = db.query(BacklogMetricModel)
    
    if department_id:
        query = query.filter(BacklogMetricModel.department_id == department_id)
    elif current_user["role"] != "admin":
        query = query.filter(BacklogMetricModel.department_id == current_user["department_id"])
    
    metric = query.order_by(BacklogMetricModel.measured_at.desc()).first()
    if not metric:
        raise HTTPException(status_code=404, detail="No backlog metrics found")
    
    return metric

@router.post("/calculate", response_model=BacklogMetricResponse)
async def calculate_backlog_metrics(
    department_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Calculate and store new backlog metrics for a department"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    if current_user["role"] != "admin" and current_user["department_id"] != department_id:
        raise HTTPException(status_code=403, detail="Can only calculate metrics for your own department")
    
    # Get tasks for department
    tasks = db.query(models.Task).filter(
        models.Task.department_id == department_id,
        models.Task.status != "Completed"
    ).all()
    
    now = datetime.utcnow()
    overdue_tasks = 0
    high_priority_tasks = 0
    total_delay = timedelta()
    delay_count = 0
    
    for task in tasks:
        if task.due_date and task.due_date < now:
            overdue_tasks += 1
            delay = now - task.due_date
            total_delay += delay
            delay_count += 1
        
        if task.priority in ["High", "Critical"]:
            high_priority_tasks += 1
    
    avg_delay = total_delay / delay_count if delay_count > 0 else timedelta()
    
    # Create new backlog metric
    metric = BacklogMetricModel(
        department_id=department_id,
        overdue_tasks=overdue_tasks,
        high_priority_tasks=high_priority_tasks,
        avg_delay=avg_delay,
        measured_at=now
    )
    
    db.add(metric)
    db.commit()
    db.refresh(metric)
    
    return metric

@router.get("/summary", response_model=dict)
async def get_backlog_summary(
    department_id: Optional[int] = None,
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary statistics for backlog metrics"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.query(
        func.avg(BacklogMetricModel.overdue_tasks).label('avg_overdue'),
        func.avg(BacklogMetricModel.high_priority_tasks).label('avg_high_priority'),
        func.avg(BacklogMetricModel.avg_delay).label('avg_delay'),
        func.max(BacklogMetricModel.overdue_tasks).label('max_overdue'),
        func.max(BacklogMetricModel.high_priority_tasks).label('max_high_priority')
    ).filter(BacklogMetricModel.measured_at >= start_date)
    
    if department_id:
        query = query.filter(BacklogMetricModel.department_id == department_id)
    elif current_user["role"] != "admin":
        query = query.filter(BacklogMetricModel.department_id == current_user["department_id"])
    
    stats = query.first()
    
    return {
        "average_overdue_tasks": round(stats.avg_overdue or 0, 2),
        "average_high_priority_tasks": round(stats.avg_high_priority or 0, 2),
        "average_delay_hours": round(stats.avg_delay.total_seconds() / 3600 if stats.avg_delay else 0, 2),
        "max_overdue_tasks": stats.max_overdue or 0,
        "max_high_priority_tasks": stats.max_high_priority or 0
    }

@router.get("/{metric_id}", response_model=BacklogMetricResponse)
async def get_backlog_metric(
    metric_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific backlog metric by ID"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    metric = db.query(BacklogMetricModel).filter(BacklogMetricModel.id == metric_id).first()
    if not metric:
        raise HTTPException(status_code=404, detail="Metric not found")
    
    if current_user["role"] != "admin" and metric.department_id != current_user["department_id"]:
        raise HTTPException(status_code=403, detail="Cannot access metrics from other departments")
    
    return metric 