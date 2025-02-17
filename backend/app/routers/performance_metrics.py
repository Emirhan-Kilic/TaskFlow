from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime, timedelta

router = APIRouter(prefix="/performance-metrics", tags=["performance-metrics"])

class PerformanceMetricBase(BaseModel):
    user_id: int
    department_id: int
    tasks_completed: int = 0
    avg_completion_time: timedelta
    efficiency_ratio: float
    quality_rating: float

@router.get("/")
async def get_performance_metrics(
    department_id: Optional[int] = None,
    user_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    query = supabase.table("performance_metrics").select("""
        id,
        user_id,
        department_id,
        tasks_completed,
        avg_completion_time,
        efficiency_ratio,
        quality_rating,
        measured_at,
        user:users!performance_metrics_user_id_fkey (
            id,
            display_name,
            profile_picture,
            job_title
        ),
        department:departments!performance_metrics_department_id_fkey (
            id,
            name
        )
    """).order("measured_at", {"ascending": False})
    
    if department_id:
        query = query.eq("department_id", department_id)
    if user_id:
        query = query.eq("user_id", user_id)
    
    response = query.execute()
    return response.data

@router.post("/calculate")
async def calculate_performance_metrics(
    user_id: int,
    department_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Get completed tasks for user
    completed_tasks = supabase.table("task_assignments")\
        .select("*")\
        .eq("assigned_to", user_id)\
        .eq("status", "Completed")\
        .execute()
    
    if not completed_tasks.data:
        raise HTTPException(status_code=400, detail="No completed tasks found")
    
    # Calculate metrics
    tasks_completed = len(completed_tasks.data)
    
    completion_times = [
        datetime.fromisoformat(task["completed_at"]) - datetime.fromisoformat(task["started_at"])
        for task in completed_tasks.data
        if task["completed_at"] and task["started_at"]
    ]
    
    avg_completion_time = sum(completion_times, timedelta()) / len(completion_times) if completion_times else timedelta()
    
    # Calculate efficiency ratio (completed tasks / total assigned tasks)
    total_tasks = supabase.table("task_assignments")\
        .select("count", count="exact")\
        .eq("assigned_to", user_id)\
        .execute()
    
    efficiency_ratio = tasks_completed / total_tasks.count if total_tasks.count > 0 else 0
    
    # Calculate quality rating (based on task priorities and completion times)
    quality_rating = calculate_quality_rating(completed_tasks.data)
    
    metric = PerformanceMetricBase(
        user_id=user_id,
        department_id=department_id,
        tasks_completed=tasks_completed,
        avg_completion_time=avg_completion_time,
        efficiency_ratio=efficiency_ratio,
        quality_rating=quality_rating
    )
    
    response = supabase.table("performance_metrics").insert({
        **metric.dict(),
        "measured_at": datetime.now().isoformat()
    }).execute()
    
    return response.data

def calculate_quality_rating(completed_tasks: List[dict]) -> float:
    # Implementation of quality rating calculation
    # This could consider factors like:
    # - Task priority
    # - Completion time vs. estimated time
    # - Number of revisions
    # Returns a value between 0 and 5
    return 4.0  # Placeholder implementation

@router.get("/backlog")
async def get_backlog_metrics(
    department_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get backlog metrics for departments"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    query = supabase.table("backlog_metrics").select("""
        id,
        department_id,
        overdue_tasks,
        high_priority_tasks,
        avg_delay,
        measured_at,
        department:departments!backlog_metrics_department_id_fkey (
            id,
            name
        )
    """).order("measured_at", {"ascending": False})
    
    if department_id:
        query = query.eq("department_id", department_id)
    
    response = query.execute()
    return response.data

@router.post("/backlog/calculate")
async def calculate_backlog_metrics(
    department_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Calculate and store backlog metrics for a department"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Get tasks for department
    tasks = supabase.table("tasks")\
        .select("*")\
        .eq("department_id", department_id)\
        .execute()
    
    if not tasks.data:
        raise HTTPException(status_code=400, detail="No tasks found for department")
    
    now = datetime.now()
    
    # Calculate overdue tasks
    overdue_tasks = sum(1 for task in tasks.data 
                       if task["due_date"] and datetime.fromisoformat(task["due_date"]) < now)
    
    # Calculate high priority tasks
    high_priority_tasks = sum(1 for task in tasks.data 
                            if task["priority"] in ["High", "Critical"])
    
    # Calculate average delay
    delays = [
        now - datetime.fromisoformat(task["due_date"])
        for task in tasks.data
        if task["due_date"] and datetime.fromisoformat(task["due_date"]) < now
    ]
    avg_delay = sum(delays, timedelta()) / len(delays) if delays else timedelta()
    
    response = supabase.table("backlog_metrics").insert({
        "department_id": department_id,
        "overdue_tasks": overdue_tasks,
        "high_priority_tasks": high_priority_tasks,
        "avg_delay": avg_delay.total_seconds(),
        "measured_at": now.isoformat()
    }).execute()
    
    return response.data

@router.get("/history")
async def get_performance_history(
    user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get historical performance metrics with optional filters"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    query = supabase.table("performance_metrics").select("*")
    
    if user_id:
        query = query.eq("user_id", user_id)
    if department_id:
        query = query.eq("department_id", department_id)
    if start_date:
        query = query.gte("measured_at", start_date.isoformat())
    if end_date:
        query = query.lte("measured_at", end_date.isoformat())
    
    response = query.execute()
    return response.data 