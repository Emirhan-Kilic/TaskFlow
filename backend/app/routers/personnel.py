from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime, timedelta
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel

router = APIRouter(prefix="/personnel", tags=["personnel"])

class PersonalStats(BaseModel):
    activeTasks: int
    completedTasks: int
    tasksThisWeek: int
    completionRate: int
    upcomingDeadlines: int
    activeTasksChange: int
    tasksThisWeekChange: int
    completionRateChange: int

@router.get("/stats")
async def get_personal_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "personnel":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    today = datetime.now()
    oneWeekAgo = today - timedelta(days=7)
    twoWeeksAgo = today - timedelta(days=14)
    
    # Get active tasks count
    active_tasks = supabase.table("task_assignments")\
        .select("*", count="exact")\
        .eq("assigned_to", current_user["id"])\
        .in_("status", ["To Do", "In Progress", "Under Review"])\
        .execute()
    
    # Get previous period active tasks
    prev_active_tasks = supabase.table("task_assignments")\
        .select("*", count="exact")\
        .eq("assigned_to", current_user["id"])\
        .in_("status", ["To Do", "In Progress", "Under Review"])\
        .gte("created_at", twoWeeksAgo.isoformat())\
        .lt("created_at", oneWeekAgo.isoformat())\
        .execute()
    
    # Get completed tasks
    completed_tasks = supabase.table("task_assignments")\
        .select("*", count="exact")\
        .eq("assigned_to", current_user["id"])\
        .eq("status", "Completed")\
        .gte("completed_at", oneWeekAgo.isoformat())\
        .execute()
    
    # Get previous period completed tasks
    prev_completed_tasks = supabase.table("task_assignments")\
        .select("*", count="exact")\
        .eq("assigned_to", current_user["id"])\
        .eq("status", "Completed")\
        .gte("completed_at", twoWeeksAgo.isoformat())\
        .lt("completed_at", oneWeekAgo.isoformat())\
        .execute()
    
    # Get upcoming deadlines
    upcoming_tasks = supabase.table("tasks")\
        .select("id, task_assignments!inner(id, status, assigned_to)")\
        .eq("task_assignments.assigned_to", current_user["id"])\
        .neq("task_assignments.status", "Completed")\
        .gte("due_date", today.isoformat())\
        .lte("due_date", (today + timedelta(days=7)).isoformat())\
        .execute()
    
    # Calculate stats
    active_count = active_tasks.count or 0
    completed_count = completed_tasks.count or 0
    prev_active_count = prev_active_tasks.count or 0
    prev_completed_count = prev_completed_tasks.count or 0
    
    total_tasks = active_count + completed_count
    completion_rate = round((completed_count / total_tasks) * 100) if total_tasks > 0 else 0
    
    prev_total = prev_active_count + prev_completed_count
    prev_completion_rate = round((prev_completed_count / prev_total) * 100) if prev_total > 0 else 0
    
    def calculate_change(current: int, previous: int) -> int:
        if previous == 0:
            return 100 if current > 0 else 0
        return round(((current - previous) / previous) * 100)
    
    return PersonalStats(
        activeTasks=active_count,
        completedTasks=completed_count,
        tasksThisWeek=total_tasks,
        completionRate=completion_rate,
        upcomingDeadlines=len(upcoming_tasks.data or []),
        activeTasksChange=calculate_change(active_count, prev_active_count),
        tasksThisWeekChange=calculate_change(completed_count, prev_completed_count),
        completionRateChange=calculate_change(completion_rate, prev_completion_rate)
    ) 