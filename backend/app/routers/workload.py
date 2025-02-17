from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime, timedelta

router = APIRouter(prefix="/workload", tags=["workload"])

class WorkloadData(BaseModel):
    userId: int
    userName: str
    profilePicture: Optional[str]
    jobTitle: Optional[str]
    taskCount: int
    criticalTasks: int
    highPriorityTasks: int
    mediumPriorityTasks: int
    lowPriorityTasks: int
    averageProgress: float
    overdueTasks: int
    upcomingDeadlines: int
    totalEstimatedHours: float
    tasksByStatus: dict
    workloadScore: float
    efficiencyRate: float
    taskCompletionRate: float
    workloadTrend: List[float]
    riskScore: float

class OptimizationSuggestion(BaseModel):
    fromUser: str
    toUser: str
    taskId: int
    taskTitle: str
    priority: str
    reason: str

class OptimizationResponse(BaseModel):
    suggestions: List[OptimizationSuggestion]
    summary: str
    impactScore: float

@router.get("/distribution")
async def get_workload_distribution(
    department_id: int,
    time_range: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "manager":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Calculate date range
    today = datetime.now()
    range_end = today + timedelta(
        days=7 if time_range == "week" else 30 if time_range == "month" else 90
    )
    
    # Fetch assignments with task and user details
    assignments = supabase.table("task_assignments").select("""
        id,
        status,
        progress,
        started_at,
        assigned_to:users!task_assignments_assigned_to_fkey (
            id,
            display_name,
            profile_picture,
            job_title
        ),
        task:tasks!inner (
            id,
            department_id,
            priority,
            due_date,
            start_date
        )
    """).eq("task.department_id", department_id).execute()
    
    if assignments.error:
        raise HTTPException(status_code=400, detail=str(assignments.error))
    
    # Process workload data
    workload_map = {}
    # ... (implement workload calculation logic)
    
    return assignments.data

@router.post("/optimize")
async def generate_optimization_suggestions(
    department_id: int,
    workload_data: List[WorkloadData],
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "manager":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # Implement optimization logic using AI service
    # Return optimization suggestions
    pass 