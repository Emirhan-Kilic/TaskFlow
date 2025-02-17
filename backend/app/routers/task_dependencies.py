from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/task-dependencies", tags=["task-dependencies"])

class DependencyBase(BaseModel):
    task_id: int
    depends_on: int
    dependency_type: str  # e.g., 'blocks', 'requires', 'relates_to'

class DependencyResponse(BaseModel):
    id: int
    task_id: int
    depends_on: int
    dependency_type: str
    created_at: datetime
    task: dict  # Contains task details
    dependency: dict  # Contains dependency task details

@router.get("/")
async def get_task_dependencies(
    task_id: Optional[int] = None,
    depends_on: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("task_dependencies").select("""
        id,
        task_id,
        depends_on,
        dependency_type,
        created_at,
        task:tasks!task_dependencies_task_id_fkey (
            id,
            title,
            priority,
            due_date
        ),
        dependency:tasks!task_dependencies_depends_on_fkey (
            id,
            title,
            priority,
            due_date
        )
    """)
    
    if task_id:
        query = query.eq("task_id", task_id)
    if depends_on:
        query = query.eq("depends_on", depends_on)
    
    response = query.execute()
    return response.data

@router.post("/")
async def create_task_dependency(
    dependency: DependencyBase,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # Check for circular dependency
    if dependency.task_id == dependency.depends_on:
        raise HTTPException(
            status_code=400,
            detail="Task cannot depend on itself"
        )
    
    supabase = get_supabase_client()
    
    # Check if dependency already exists
    existing = supabase.table("task_dependencies")\
        .select("id")\
        .eq("task_id", dependency.task_id)\
        .eq("depends_on", dependency.depends_on)\
        .execute()
    
    if existing.data:
        raise HTTPException(
            status_code=400,
            detail="Dependency already exists"
        )
    
    response = supabase.table("task_dependencies").insert({
        **dependency.dict(),
        "created_at": datetime.now().isoformat()
    }).execute()
    return response.data

@router.delete("/{dependency_id}")
async def delete_task_dependency(
    dependency_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("task_dependencies")\
        .delete()\
        .eq("id", dependency_id)\
        .execute()
    return response.data

@router.get("/{dependency_id}", response_model=DependencyResponse)
async def get_task_dependency(
    dependency_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific task dependency by ID"""
    supabase = get_supabase_client()
    response = supabase.table("task_dependencies").select("""
        id,
        task_id,
        depends_on,
        dependency_type,
        created_at,
        task:tasks!task_dependencies_task_id_fkey (
            id, title, priority, due_date, description,
            department_id, created_by, start_date, version
        ),
        dependency:tasks!task_dependencies_depends_on_fkey (
            id, title, priority, due_date, description,
            department_id, created_by, start_date, version
        )
    """).eq("id", dependency_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Dependency not found")
    
    return response.data[0]

@router.put("/{dependency_id}")
async def update_task_dependency(
    dependency_id: int,
    dependency: DependencyBase,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing task dependency"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # Check for circular dependency
    if dependency.task_id == dependency.depends_on:
        raise HTTPException(
            status_code=400,
            detail="Task cannot depend on itself"
        )
    
    supabase = get_supabase_client()
    
    # Check if dependency exists
    existing = supabase.table("task_dependencies")\
        .select("id")\
        .eq("id", dependency_id)\
        .execute()
    
    if not existing.data:
        raise HTTPException(status_code=404, detail="Dependency not found")
    
    response = supabase.table("task_dependencies")\
        .update(dependency.dict())\
        .eq("id", dependency_id)\
        .execute()
    
    return response.data

@router.get("/task/{task_id}/all")
async def get_all_task_dependencies(
    task_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get both dependencies and dependent tasks for a specific task"""
    supabase = get_supabase_client()
    
    # Get tasks that this task depends on
    depends_on = supabase.table("task_dependencies").select("""
        id,
        task_id,
        depends_on,
        dependency_type,
        created_at,
        dependency:tasks!task_dependencies_depends_on_fkey (
            id, title, priority, due_date
        )
    """).eq("task_id", task_id).execute()
    
    # Get tasks that depend on this task
    dependent_tasks = supabase.table("task_dependencies").select("""
        id,
        task_id,
        depends_on,
        dependency_type,
        created_at,
        task:tasks!task_dependencies_task_id_fkey (
            id, title, priority, due_date
        )
    """).eq("depends_on", task_id).execute()
    
    return {
        "depends_on": depends_on.data,
        "dependent_tasks": dependent_tasks.data
    } 