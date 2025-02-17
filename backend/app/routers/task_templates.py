from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime, timedelta

router = APIRouter(prefix="/task-templates", tags=["task-templates"])

class TaskTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    default_priority: str  # priority_enum: 'Low', 'Medium', 'High', 'Critical'
    estimated_duration: Optional[timedelta] = None
    department_id: int
    created_by: int

class TaskTemplateResponse(TaskTemplateBase):
    id: int
    created_at: datetime

@router.get("/", response_model=List[TaskTemplateResponse])
async def get_task_templates(
    department_id: Optional[int] = None,
    created_by: Optional[int] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("task_templates").select("""
        *,
        department:departments!task_templates_department_id_fkey (
            id,
            name,
            description
        ),
        creator:users!task_templates_created_by_fkey (
            id,
            display_name,
            profile_picture,
            email
        )
    """)
    
    if department_id:
        query = query.eq("department_id", department_id)
    if created_by:
        query = query.eq("created_by", created_by)
    if search:
        query = query.ilike("name", f"%{search}%")
    
    response = query.execute()
    return response.data

@router.get("/{template_id}", response_model=TaskTemplateResponse)
async def get_task_template(
    template_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("task_templates").select("""
        *,
        department:departments!task_templates_department_id_fkey (
            id,
            name,
            description
        ),
        creator:users!task_templates_created_by_fkey (
            id,
            display_name,
            profile_picture,
            email
        )
    """).eq("id", template_id).single().execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return response.data

@router.post("/")
async def create_task_template(
    template: TaskTemplateBase,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("task_templates").insert({
        **template.dict(),
        "created_at": datetime.now().isoformat()
    }).execute()
    return response.data

@router.put("/{template_id}", response_model=TaskTemplateResponse)
async def update_task_template(
    template_id: int,
    template: TaskTemplateBase,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # Verify template exists
    existing = await get_task_template(template_id, current_user)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    
    supabase = get_supabase_client()
    response = supabase.table("task_templates")\
        .update({**template.dict()})\
        .eq("id", template_id)\
        .execute()
    return response.data[0]

@router.get("/department/{department_id}/count")
async def get_department_template_count(
    department_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("task_templates")\
        .select("id", count="exact")\
        .eq("department_id", department_id)\
        .execute()
    return {"count": response.count}

@router.delete("/{template_id}")
async def delete_task_template(
    template_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Check if template is being used by any tasks
    tasks = supabase.table("tasks")\
        .select("id")\
        .eq("template_id", template_id)\
        .execute()
        
    if tasks.data and len(tasks.data) > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Template is in use by {len(tasks.data)} tasks and cannot be deleted"
        )
    
    # If no tasks are using the template, proceed with deletion
    response = supabase.table("task_templates")\
        .delete()\
        .eq("id", template_id)\
        .execute()
        
    return {"message": "Template deleted successfully"}

@router.get("/tasks/{template_id}")
async def get_tasks_from_template(
    template_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("tasks").select("""
        *,
        assignments:task_assignments(
            id,
            assigned_to,
            status,
            progress
        )
    """).eq("template_id", template_id).execute()
    return response.data