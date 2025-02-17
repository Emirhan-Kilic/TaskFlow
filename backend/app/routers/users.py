from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Path
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from sqlalchemy import func
from ..database import get_db
from . import models, schemas
from ..auth import get_current_user, get_password_hash
from ..utils.storage import upload_file, delete_file

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/me", response_model=schemas.UserDetail)
async def get_current_user_profile(
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed profile of current user"""
    # Get task statistics
    task_stats = db.query(
        models.TaskAssignment.status,
        func.count(models.TaskAssignment.id)
    ).filter(
        models.TaskAssignment.assigned_to == current_user.id
    ).group_by(models.TaskAssignment.status).all()
    
    # Get recent activities
    recent_activities = db.query(models.TaskAssignment).filter(
        models.TaskAssignment.assigned_to == current_user.id
    ).order_by(models.TaskAssignment.updated_at.desc()).limit(5).all()
    
    return {
        **current_user.dict(),
        "task_stats": dict(task_stats),
        "recent_activities": recent_activities
    }

@router.patch("/me", response_model=schemas.User)
async def update_user_profile(
    profile_update: schemas.UserUpdate,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user's profile"""
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    
    for key, value in profile_update.dict(exclude_unset=True).items():
        if key == "password" and value:
            value = get_password_hash(value)
        setattr(user, key, value)
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user

@router.post("/me/avatar", response_model=schemas.User)
async def update_profile_picture(
    file: UploadFile = File(...),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's profile picture"""
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    
    # Delete old profile picture if exists
    if user.profile_picture:
        await delete_file(user.profile_picture)
    
    # Upload new profile picture
    file_url = await upload_file(file, f"users/{user.id}/avatar")
    user.profile_picture = file_url
    user.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(user)
    return user

@router.get("/workload", response_model=List[schemas.UserWorkload])
async def get_users_workload(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get workload statistics for all users in department"""
    users = db.query(models.User).filter(
        models.User.department_id == current_user.department_id
    ).all()
    
    result = []
    for user in users:
        assignments = db.query(models.TaskAssignment).filter(
            models.TaskAssignment.assigned_to == user.id,
            models.TaskAssignment.status.in_(['To Do', 'In Progress', 'Under Review'])
        ).all()
        
        total_tasks = len(assignments)
        workload_score = calculate_workload_score(assignments)
        
        result.append({
            "user": user,
            "active_tasks": total_tasks,
            "workload_score": workload_score,
            "assignments": assignments
        })
    
    return result

@router.get("/performance", response_model=List[schemas.UserPerformance])
async def get_users_performance(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
    period: Optional[str] = "month"
):
    """Get performance metrics for all users in department"""
    start_date = get_period_start_date(period)
    users = db.query(models.User).filter(
        models.User.department_id == current_user.department_id
    ).all()
    
    result = []
    for user in users:
        completed_tasks = db.query(models.TaskAssignment).filter(
            models.TaskAssignment.assigned_to == user.id,
            models.TaskAssignment.status == 'Completed',
            models.TaskAssignment.completed_at >= start_date
        ).all()
        
        total_tasks = len(completed_tasks)
        on_time_tasks = sum(1 for t in completed_tasks if not t.task.due_date or t.completed_at <= t.task.due_date)
        efficiency_rate = calculate_efficiency_rate(completed_tasks)
        
        result.append({
            "user": user,
            "completed_tasks": total_tasks,
            "on_time_completion_rate": (on_time_tasks / total_tasks * 100) if total_tasks > 0 else 0,
            "efficiency_rate": efficiency_rate,
            "period": period
        })
    
    return result

@router.get("/availability", response_model=List[schemas.UserAvailability])
async def get_users_availability(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get availability status for all users in department"""
    users = db.query(models.User).filter(
        models.User.department_id == current_user.department_id
    ).all()
    
    result = []
    for user in users:
        active_tasks = db.query(models.TaskAssignment).filter(
            models.TaskAssignment.assigned_to == user.id,
            models.TaskAssignment.status.in_(['To Do', 'In Progress', 'Under Review'])
        ).count()
        
        result.append({
            "user": user,
            "active_tasks": active_tasks,
            "last_login": user.last_login,
            "is_available": active_tasks < 5  # Example threshold
        })
    
    return result

@router.get("/{user_id}", response_model=schemas.UserDetail)
async def get_user_by_id(
    user_id: int = Path(...),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed profile of a specific user"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get task statistics
    task_stats = db.query(
        models.TaskAssignment.status,
        func.count(models.TaskAssignment.id)
    ).filter(
        models.TaskAssignment.assigned_to == user_id
    ).group_by(models.TaskAssignment.status).all()
    
    return {
        **user.__dict__,
        "task_stats": dict(task_stats)
    }

@router.get("/department/{dept_id}", response_model=List[schemas.UserBasic])
async def get_users_by_department(
    dept_id: int = Path(...),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all users in a specific department"""
    users = db.query(models.User).filter(
        models.User.department_id == dept_id
    ).all()
    return users

@router.get("/subdepartment/{subdept_id}", response_model=List[schemas.UserBasic])
async def get_users_by_subdepartment(
    subdept_id: int = Path(...),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all users in a specific subdepartment"""
    users = db.query(models.User).join(
        models.SubdepartmentParticipation
    ).filter(
        models.SubdepartmentParticipation.subdepartment_id == subdept_id
    ).all()
    return users

@router.get("/metrics/{user_id}", response_model=schemas.UserMetrics)
async def get_user_metrics(
    user_id: int = Path(...),
    period: str = Query("month", enum=["week", "month", "quarter", "year"]),
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get comprehensive metrics for a specific user"""
    start_date = get_period_start_date(period)
    
    # Get performance metrics
    metrics = db.query(models.PerformanceMetrics).filter(
        models.PerformanceMetrics.user_id == user_id,
        models.PerformanceMetrics.measured_at >= start_date
    ).order_by(models.PerformanceMetrics.measured_at.desc()).first()
    
    return metrics

@router.post("/role", response_model=schemas.User)
async def update_user_role(
    user_update: schemas.UserRoleUpdate,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's role (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update roles")
    
    user = db.query(models.User).filter(models.User.id == user_update.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.role = user_update.new_role
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user

def calculate_workload_score(assignments: List[models.TaskAssignment]) -> float:
    """Calculate workload score based on task priority and progress"""
    if not assignments:
        return 0
    
    priority_weights = {
        'Critical': 4,
        'High': 3,
        'Medium': 2,
        'Low': 1
    }
    
    weighted_sum = sum(
        priority_weights[a.task.priority] * (1 - a.progress/100)
        for a in assignments
    )
    
    return min(weighted_sum * 10, 100)  # Scale to 0-100

def calculate_efficiency_rate(assignments: List[models.TaskAssignment]) -> float:
    """Calculate efficiency rate based on task completion times"""
    if not assignments:
        return 0
    
    efficiency_rates = []
    for assignment in assignments:
        if assignment.started_at and assignment.completed_at:
            actual_duration = assignment.completed_at - assignment.started_at
            estimated_duration = timedelta(days=5)  # Default estimation
            if actual_duration > timedelta(0):
                rate = min(estimated_duration / actual_duration, 1)
                efficiency_rates.append(rate)
    
    return sum(efficiency_rates) / len(efficiency_rates) if efficiency_rates else 0

def get_period_start_date(period: str) -> datetime:
    """Get start date based on period"""
    now = datetime.utcnow()
    if period == "week":
        return now - timedelta(days=7)
    elif period == "month":
        return now - timedelta(days=30)
    elif period == "quarter":
        return now - timedelta(days=90)
    else:
        return now - timedelta(days=365) 
    

@router.post("/")
async def create_user(
    user: UserCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    now = datetime.now().isoformat()
    
    response = supabase.table("users").insert({
        **user.dict(),
        "created_at": now,
        "updated_at": now
    }).execute()
    
    return response.data