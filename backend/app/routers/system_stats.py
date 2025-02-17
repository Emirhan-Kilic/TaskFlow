from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/system-stats", tags=["system-stats"])

@router.get("/")
async def get_system_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Get total users
    users_response = supabase.table("users").select("count", count="exact").execute()
    total_users = users_response.count if hasattr(users_response, 'count') else 0
    
    # Get total departments
    depts_response = supabase.table("departments").select("count", count="exact").execute()
    total_departments = depts_response.count if hasattr(depts_response, 'count') else 0
    
    # Get active tasks
    tasks_response = supabase.table("tasks")\
        .select("count", count="exact")\
        .not_("task_assignments", "cs", '{"status":"completed"}')\
        .execute()
    active_tasks = tasks_response.count if hasattr(tasks_response, 'count') else 0
    
    # Get storage usage
    storage_response = supabase.table("task_attachments")\
        .select("file_size")\
        .execute()
    storage_used = sum(attachment["file_size"] for attachment in storage_response.data)
    
    return {
        "total_users": total_users,
        "total_departments": total_departments,
        "active_tasks": active_tasks,
        "storage_used": f"{storage_used / (1024 * 1024):.2f} MB"
    }

@router.get("/activity-log")
async def get_activity_log(
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("activity_log")\
        .select("""
            id,
            action,
            entity_type,
            entity_id,
            user_id,
            metadata,
            created_at,
            user:user_id (
                display_name,
                profile_picture
            )
        """)\
        .order("created_at", {"ascending": False})\
        .limit(limit)\
        .execute()
    
    return response.data 

@router.get("/detailed")
async def get_detailed_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Task Statistics
    task_stats = supabase.table("tasks")\
        .select("priority, count", count="exact")\
        .execute()
    
    # Task Assignment Statistics
    assignment_stats = supabase.table("task_assignments")\
        .select("status, count", count="exact")\
        .execute()
    
    # Department Statistics
    dept_stats = supabase.table("departments")\
        .select("id, name, employee_count")\
        .execute()
    
    # Subdepartment Statistics
    subdept_stats = supabase.table("subdepartments")\
        .select("count", count="exact")\
        .execute()
    
    # Performance Metrics
    performance_stats = supabase.table("performance_metrics")\
        .select("avg(efficiency_ratio), avg(quality_rating)")\
        .execute()
    
    # Backlog Statistics
    backlog_stats = supabase.table("backlog_metrics")\
        .select("sum(overdue_tasks), sum(high_priority_tasks)")\
        .execute()
    
    return {
        "task_statistics": task_stats.data,
        "assignment_statistics": assignment_stats.data,
        "department_statistics": dept_stats.data,
        "subdepartment_count": subdept_stats.count,
        "performance_metrics": performance_stats.data,
        "backlog_metrics": backlog_stats.data
    }

@router.get("/department/{department_id}")
async def get_department_stats(
    department_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Department Details
    dept_response = supabase.table("departments")\
        .select("*, manager:manager_id(*)")\
        .eq("id", department_id)\
        .single()\
        .execute()
    
    # Subdepartments
    subdepts_response = supabase.table("subdepartments")\
        .select("*")\
        .eq("department_id", department_id)\
        .execute()
    
    # Task Statistics
    tasks_response = supabase.table("tasks")\
        .select("priority, status, count", count="exact")\
        .eq("department_id", department_id)\
        .execute()
    
    # Performance Metrics
    performance_response = supabase.table("performance_metrics")\
        .select("*")\
        .eq("department_id", department_id)\
        .order("measured_at", {"ascending": False})\
        .limit(1)\
        .execute()
    
    return {
        "department_details": dept_response.data,
        "subdepartments": subdepts_response.data,
        "task_statistics": tasks_response.data,
        "performance_metrics": performance_response.data
    }

@router.get("/user-metrics/{user_id}")
async def get_user_metrics(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # User's Task Statistics
    task_stats = supabase.table("task_assignments")\
        .select("status, count", count="exact")\
        .eq("assigned_to", user_id)\
        .execute()
    
    # Performance Metrics
    performance = supabase.table("performance_metrics")\
        .select("*")\
        .eq("user_id", user_id)\
        .order("measured_at", {"ascending": False})\
        .limit(5)\
        .execute()
    
    # Participation in Subdepartments
    subdept_participation = supabase.table("subdepartmentParticipations")\
        .select("*, subdepartment:subdepartment_id(*)")\
        .eq("user_id", user_id)\
        .execute()
    
    return {
        "task_statistics": task_stats.data,
        "performance_history": performance.data,
        "subdepartment_participations": subdept_participation.data
    }

@router.get("/storage-analytics")
async def get_storage_analytics(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Storage by File Type
    storage_by_type = supabase.table("task_attachments")\
        .select("file_type, sum(file_size)")\
        .group_by("file_type")\
        .execute()
    
    # Storage by Department
    storage_by_dept = supabase.table("task_attachments")\
        .select("""
            tasks!inner(department_id),
            sum(file_size)
        """)\
        .group_by("tasks.department_id")\
        .execute()
    
    return {
        "storage_by_file_type": storage_by_type.data,
        "storage_by_department": storage_by_dept.data
    }

@router.get("/api/admin/system-stats")
async def get_admin_system_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Get total users
    users_response = supabase.table("users").select("count", count="exact").execute()
    total_users = users_response.count if hasattr(users_response, 'count') else 0
    
    # Get total departments
    depts_response = supabase.table("departments").select("count", count="exact").execute()
    total_departments = depts_response.count if hasattr(depts_response, 'count') else 0
    
    # Get active tasks
    tasks_response = supabase.table("tasks").select("count", count="exact").execute()
    active_tasks = tasks_response.count if hasattr(tasks_response, 'count') else 0
    
    # Get storage usage
    storage_response = supabase.table("task_attachments").select("file_size").execute()
    storage_used = sum(attachment["file_size"] for attachment in storage_response.data)
    
    return {
        "total_users": total_users,
        "total_departments": total_departments,
        "active_tasks": active_tasks,
        "storage_used": storage_used
    } 


@router.get("/admin-dashboard")
async def get_admin_dashboard_data(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Get all required data in parallel
    [users_data, depts_data, tasks_data, templates_data, 
     events_data, attachments_data, subdepts_data, participations_data] = await asyncio.gather(
        supabase.table("users").select("*").execute(),
        supabase.table("departments").select("*").execute(),
        supabase.table("tasks").select("*").execute(),
        supabase.table("task_templates").select("*").execute(),
        supabase.table("calendar_events").select("*").execute(),
        supabase.table("task_attachments").select("*").execute(),
        supabase.table("subdepartments").select("*").execute(),
        supabase.table("subdepartment_participations").select("*").execute()
    )
    
    return {
        "users": users_data.data,
        "departments": depts_data.data,
        "tasks": tasks_data.data,
        "templates": templates_data.data,
        "events": events_data.data,
        "attachments": attachments_data.data,
        "subdepartments": subdepts_data.data,
        "participations": participations_data.data
    }