from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime, timedelta
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel

router = APIRouter(prefix="/department-stats", tags=["department-stats"])

class DepartmentStats(BaseModel):
    activeTasks: int
    teamMembers: int
    tasksThisWeek: int
    completionRate: int
    upcomingDeadlines: int
    activeTasksChange: int
    tasksThisWeekChange: int
    completionRateChange: int

@router.get("/{department_id}")
async def get_department_stats(
    department_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "manager":
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    supabase = get_supabase_client()
    
    # Time periods
    twoWeeksAgo = (datetime.now() - timedelta(days=14)).isoformat()
    oneWeekAgo = (datetime.now() - timedelta(days=7)).isoformat()
    today = datetime.now().isoformat()
    endOfWeek = (datetime.now() + timedelta(days=7)).isoformat()

    # Get department tasks
    tasks = supabase.table("tasks").select("id, created_at").eq("department_id", department_id).execute()
    if tasks.error:
        raise HTTPException(status_code=400, detail=str(tasks.error))
    
    task_ids = [task["id"] for task in tasks.data]

    # Get active tasks (current and previous period)
    active_tasks = supabase.table("task_assignments").select("id").in_("task_id", task_ids)\
        .or_("status.eq.To Do,status.eq.In Progress,status.eq.Under Review").execute()
        
    prev_active_tasks = supabase.table("task_assignments").select("id").in_("task_id", task_ids)\
        .or_("status.eq.To Do,status.eq.In Progress,status.eq.Under Review")\
        .lt("created_at", oneWeekAgo).gte("created_at", twoWeeksAgo).execute()

    # Get team members
    team_members = supabase.table("users").select("id").eq("department_id", department_id).execute()

    # Get tasks this week and previous week
    week_tasks = supabase.table("tasks").select("id").eq("department_id", department_id)\
        .gte("created_at", oneWeekAgo).execute()
        
    prev_week_tasks = supabase.table("tasks").select("id").eq("department_id", department_id)\
        .lt("created_at", oneWeekAgo).gte("created_at", twoWeeksAgo).execute()

    # Get completed tasks
    completed_tasks = supabase.table("task_assignments").select("id").in_("task_id", task_ids)\
        .eq("status", "Completed").gte("completed_at", oneWeekAgo).execute()
        
    prev_completed_tasks = supabase.table("task_assignments").select("id").in_("task_id", task_ids)\
        .eq("status", "Completed").lt("completed_at", oneWeekAgo)\
        .gte("completed_at", twoWeeksAgo).execute()

    # Get upcoming deadlines
    upcoming_tasks = supabase.table("tasks").select("id, task_assignments!inner(status)")\
        .eq("department_id", department_id).gte("due_date", today)\
        .lte("due_date", endOfWeek).not_("task_assignments.status", "eq", "Completed").execute()

    # Calculate stats
    unique_upcoming = len(set(task["id"] for task in upcoming_tasks.data)) if upcoming_tasks.data else 0
    
    current_completion_rate = int((len(completed_tasks.data or []) / len(tasks.data)) * 100) if tasks.data else 0
    prev_completion_rate = int((len(prev_completed_tasks.data or []) / len(tasks.data)) * 100) if tasks.data else 0

    def calc_change(current: int, previous: int) -> int:
        if previous == 0:
            return 100 if current > 0 else 0
        return int(((current - previous) / previous) * 100)

    return {
        "activeTasks": len(active_tasks.data or []),
        "teamMembers": len(team_members.data or []),
        "tasksThisWeek": len(week_tasks.data or []),
        "completionRate": current_completion_rate,
        "upcomingDeadlines": unique_upcoming,
        "activeTasksChange": calc_change(
            len(active_tasks.data or []),
            len(prev_active_tasks.data or [])
        ),
        "tasksThisWeekChange": calc_change(
            len(week_tasks.data or []),
            len(prev_week_tasks.data or [])
        ),
        "completionRateChange": calc_change(
            current_completion_rate,
            prev_completion_rate
        )
    } 