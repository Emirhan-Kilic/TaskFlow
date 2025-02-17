from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/task-assignments", tags=["task-assignments"])

class TaskAssignmentBase(BaseModel):
    task_id: int
    assigned_to: int
    status: str  # Using task_status_enum values
    progress: int = 0
    comments: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    version: int = 1

# Add response model
class TaskAssignmentResponse(TaskAssignmentBase):
    id: int
    created_at: datetime
    updated_at: datetime

@router.get("/")
async def get_task_assignments(
    task_id: Optional[int] = None,
    user_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("task_assignments").select("""
        id,
        task_id,
        assigned_to,
        status,
        progress,
        comments,
        started_at,
        completed_at,
        version,
        created_at,
        updated_at,
        assigned_to:users!task_assignments_assigned_to_fkey (
            id,
            display_name,
            profile_picture,
            job_title,
            department_id,
            role
        ),
        task:tasks!task_assignments_task_id_fkey (
            id,
            title,
            description,
            priority,
            due_date,
            start_date,
            version
        )
    """)
    
    if task_id:
        query = query.eq("task_id", task_id)
    if user_id:
        query = query.eq("assigned_to", user_id)
    
    response = query.execute()
    return response.data

@router.post("/")
async def create_task_assignment(
    assignment: TaskAssignmentBase,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Check if assignment already exists
    existing = supabase.table("task_assignments")\
        .select("id")\
        .eq("task_id", assignment.task_id)\
        .eq("assigned_to", assignment.assigned_to)\
        .execute()
    
    if existing.data:
        raise HTTPException(
            status_code=400,
            detail="User is already assigned to this task"
        )
    
    response = supabase.table("task_assignments").insert({
        **assignment.dict(),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }).execute()
    return response.data

@router.put("/{assignment_id}")
async def update_task_assignment(
    assignment_id: int,
    assignment: TaskAssignmentBase,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    
    # Get current version
    current = supabase.table("task_assignments")\
        .select("version")\
        .eq("id", assignment_id)\
        .single()\
        .execute()
    
    if not current.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    response = supabase.table("task_assignments").update({
        **assignment.dict(),
        "version": current.data["version"] + 1,
        "updated_at": datetime.now().isoformat()
    }).eq("id", assignment_id).execute()
    return response.data

@router.delete("/{assignment_id}")
async def delete_task_assignment(
    assignment_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("task_assignments")\
        .delete()\
        .eq("id", assignment_id)\
        .execute()
    return response.data

# Add new endpoints and modify existing ones
@router.get("/metrics")
async def get_assignment_metrics(
    department_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get metrics about task assignments including completion rates and status distribution"""
    supabase = get_supabase_client()
    query = supabase.table("task_assignments").select("""
        status,
        count(*)
    """).select("task!inner (department_id)")
    
    if department_id:
        query = query.eq("task.department_id", department_id)
    
    response = query.group_by("status").execute()
    return response.data

@router.get("/user/{user_id}/stats")
async def get_user_assignment_stats(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get statistics about a user's task assignments"""
    supabase = get_supabase_client()
    response = supabase.table("performance_metrics")\
        .select("*")\
        .eq("user_id", user_id)\
        .order("measured_at", desc=True)\
        .limit(1)\
        .execute()
    return response.data

@router.put("/{assignment_id}/status")
async def update_assignment_status(
    assignment_id: int,
    status: str,  # task_status_enum values
    current_user: dict = Depends(get_current_user)
):
    """Update just the status of an assignment"""
    supabase = get_supabase_client()
    
    # Validate status enum
    if status not in ["To Do", "In Progress", "Under Review", "Completed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # Get current assignment
    current = supabase.table("task_assignments")\
        .select("*")\
        .eq("id", assignment_id)\
        .single()\
        .execute()
    
    if not current.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Set started_at and completed_at based on status
    updates = {
        "status": status,
        "version": current.data["version"] + 1,
        "updated_at": datetime.now().isoformat()
    }
    
    if status == "In Progress" and not current.data["started_at"]:
        updates["started_at"] = datetime.now().isoformat()
    elif status == "Completed" and not current.data["completed_at"]:
        updates["completed_at"] = datetime.now().isoformat()
    
    response = supabase.table("task_assignments")\
        .update(updates)\
        .eq("id", assignment_id)\
        .execute()
    return response.data

@router.put("/{assignment_id}/progress")
async def update_assignment_progress(
    assignment_id: int,
    progress: int,
    current_user: dict = Depends(get_current_user)
):
    """Update just the progress of an assignment"""
    if not 0 <= progress <= 100:
        raise HTTPException(status_code=400, detail="Progress must be between 0 and 100")
    
    supabase = get_supabase_client()
    current = supabase.table("task_assignments")\
        .select("version")\
        .eq("id", assignment_id)\
        .single()\
        .execute()
    
    if not current.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    response = supabase.table("task_assignments")\
        .update({
            "progress": progress,
            "version": current.data["version"] + 1,
            "updated_at": datetime.now().isoformat()
        })\
        .eq("id", assignment_id)\
        .execute()
    return response.data 