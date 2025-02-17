from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/performance", tags=["performance"])

class PerformanceMetric(BaseModel):
    user_id: int
    department_id: int
    tasks_completed: int
    avg_completion_time: float
    efficiency_ratio: float
    quality_rating: float

class BacklogMetric(BaseModel):
    department_id: int
    overdue_tasks: int
    high_priority_tasks: int
    avg_delay: str  # For interval
    measured_at: datetime

@router.get("/metrics")
async def get_performance_metrics(
    department_id: Optional[int] = None,
    user_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    query = supabase.table("performance_metrics").select("*").order("measured_at", {"ascending": False})
    
    if department_id:
        query = query.eq("department_id", department_id)
    if user_id:
        query = query.eq("user_id", user_id)
    if start_date:
        query = query.gte("measured_at", start_date)
    if end_date:
        query = query.lte("measured_at", end_date)
    
    response = query.execute()
    return response.data

@router.get("/backlog")
async def get_backlog_metrics(
    department_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    query = supabase.table("backlog_metrics").select("*")\
        .eq("department_id", department_id)\
        .order("measured_at", {"ascending": False})
    
    if start_date:
        query = query.gte("measured_at", start_date)
    if end_date:
        query = query.lte("measured_at", end_date)
    
    response = query.execute()
    return response.data

@router.get("/department/{department_id}/efficiency")
async def get_department_efficiency(
    department_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("performance_metrics")\
        .select("user_id, AVG(efficiency_ratio), AVG(quality_rating)")\
        .eq("department_id", department_id)\
        .group_by("user_id")\
        .execute()
    
    return response.data

@router.get("/user/{user_id}/history")
async def get_user_performance_history(
    user_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"] and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    query = supabase.table("performance_metrics")\
        .select("*")\
        .eq("user_id", user_id)\
        .order("measured_at", {"ascending": True})
    
    if start_date:
        query = query.gte("measured_at", start_date)
    if end_date:
        query = query.lte("measured_at", end_date)
    
    response = query.execute()
    return response.data

@router.get("/subdepartment/{subdepartment_id}")
async def get_subdepartment_performance(
    subdepartment_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # First get all users in the subdepartment
    users = supabase.table("subdepartmentParticipations")\
        .select("user_id")\
        .eq("subdepartment_id", subdepartment_id)\
        .execute()
    
    user_ids = [user["user_id"] for user in users.data]
    
    # Then get their performance metrics
    metrics = supabase.table("performance_metrics")\
        .select("*")\
        .in_("user_id", user_ids)\
        .order("measured_at", {"ascending": False})\
        .execute()
    
    return metrics.data

@router.get("/workload")
async def get_workload_distribution(
    department_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("task_assignments").select("""
        id,
        assigned_to (
            id,
            display_name,
            profile_picture,
            job_title
        ),
        task!inner (
            id,
            department_id,
            priority,
            due_date,
            start_date
        )
    """).eq("task.department_id", department_id).execute()
    
    return response.data 