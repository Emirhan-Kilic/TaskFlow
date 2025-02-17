from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from ..dependencies import get_current_user, get_db
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from supabase import create_client

router = APIRouter(prefix="/departments", tags=["departments"])

# Base Models
class DepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    manager_id: Optional[int] = None

class SubdepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    manager_id: Optional[int] = None

class ParticipationBase(BaseModel):
    user_id: int
    role: Optional[str] = None

# Response Models
class DepartmentResponse(DepartmentBase):
    id: int
    employee_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

class SubdepartmentResponse(SubdepartmentBase):
    id: int
    department_id: int
    employee_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

class ParticipationResponse(ParticipationBase):
    id: int
    subdepartment_id: int
    joined_at: datetime

    class Config:
        orm_mode = True

# Department Endpoints
@router.get("/", response_model=List[DepartmentResponse])
async def get_departments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all departments"""
    departments = db.query(models.Department)\
        .offset(skip)\
        .limit(limit)\
        .all()
    return departments

@router.post("/", response_model=DepartmentResponse)
async def create_department(
    department: DepartmentBase,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new department (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create departments")
    
    db_department = models.Department(**department.dict())
    db.add(db_department)
    db.commit()
    db.refresh(db_department)
    return db_department

@router.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific department"""
    department = db.query(models.Department)\
        .filter(models.Department.id == department_id)\
        .first()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    return department

@router.put("/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: int,
    department: DepartmentBase,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a department (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update departments")
    
    db_department = db.query(models.Department)\
        .filter(models.Department.id == department_id)\
        .first()
    if not db_department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    for key, value in department.dict().items():
        setattr(db_department, key, value)
    db_department.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_department)
    return db_department

@router.delete("/{department_id}")
async def delete_department(
    department_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a department (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete departments")
    
    department = db.query(models.Department)\
        .filter(models.Department.id == department_id)\
        .first()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    db.delete(department)
    db.commit()
    return {"message": "Department deleted successfully"}

@router.get("/{department_id}/stats")
async def get_department_stats(
    department_id: int,
    time_range: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "manager":
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    supabase = create_client()
    
    # Calculate date range
    today = datetime.now()
    range_end = datetime.now()
    if time_range == 'week':
        range_end = today + timedelta(days=7)
    elif time_range == 'month':
        range_end = today + timedelta(days=30)
    else:  # quarter
        range_end = today + timedelta(days=90)
    
    # Fetch all required data
    department_data = supabase.from_('departments').select("""
        id,
        name,
        description,
        employee_count,
        manager_id
    """).eq('id', department_id).single().execute()
    
    tasks_data = supabase.from_('tasks').select("""
        id,
        title,
        description,
        department_id,
        created_by,
        priority,
        due_date,
        start_date,
        version,
        template_id,
        created_at,
        updated_at,
        task_assignments (
            id,
            assigned_to,
            status,
            progress,
            comments,
            started_at,
            completed_at,
            version
        )
    """).eq('department_id', department_id).execute()
    
    performance_data = supabase.from_('performance_metrics').select("""
        id,
        user_id,
        department_id,
        tasks_completed,
        avg_completion_time,
        efficiency_ratio,
        quality_rating,
        measured_at
    """).eq('department_id', department_id).order('measured_at', {'ascending': False}).limit(30).execute()
    
    templates_data = supabase.from_('task_templates').select("""
        id,
        name,
        description,
        default_priority,
        estimated_duration,
        department_id,
        created_by,
        created_at
    """).eq('department_id', department_id).execute()
    
    backlog_data = supabase.from_('backlog_metrics').select("""
        id,
        department_id,
        overdue_tasks,
        high_priority_tasks,
        avg_delay,
        measured_at
    """).eq('department_id', department_id).order('measured_at', {'ascending': False}).limit(1).execute()
    
    # Process data using existing functions
    processed_stats = {
        'id': department_data.data['id'],
        'name': department_data.data['name'],
        'description': department_data.data['description'],
        'employeeCount': department_data.data['employee_count'],
        'taskStats': process_task_stats(tasks_data.data),
        'performance': process_performance_metrics(performance_data.data),
        'backlog': process_backlog_metrics(backlog_data.data[0] if backlog_data.data else None),
        'trends': process_trends(tasks_data.data, performance_data.data),
        'templates': process_templates(templates_data.data, tasks_data.data)
    }
    
    return processed_stats

# Subdepartment Endpoints
@router.get("/{department_id}/subdepartments", response_model=List[SubdepartmentResponse])
async def get_subdepartments(
    department_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all subdepartments of a department"""
    subdepartments = db.query(models.Subdepartment)\
        .filter(models.Subdepartment.department_id == department_id)\
        .offset(skip)\
        .limit(limit)\
        .all()
    return subdepartments

@router.post("/{department_id}/subdepartments", response_model=SubdepartmentResponse)
async def create_subdepartment(
    department_id: int,
    subdepartment: SubdepartmentBase,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new subdepartment (admin or department manager only)"""
    if not (current_user["role"] == "admin" or 
            (current_user["role"] == "manager" and current_user["department_id"] == department_id)):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    db_subdepartment = models.Subdepartment(
        **subdepartment.dict(),
        department_id=department_id
    )
    db.add(db_subdepartment)
    db.commit()
    db.refresh(db_subdepartment)
    return db_subdepartment

@router.get("/subdepartments/{subdepartment_id}", response_model=SubdepartmentResponse)
async def get_subdepartment(
    subdepartment_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific subdepartment"""
    subdepartment = db.query(models.Subdepartment)\
        .filter(models.Subdepartment.id == subdepartment_id)\
        .first()
    if not subdepartment:
        raise HTTPException(status_code=404, detail="Subdepartment not found")
    return subdepartment

@router.put("/subdepartments/{subdepartment_id}", response_model=SubdepartmentResponse)
async def update_subdepartment(
    subdepartment_id: int,
    subdepartment: SubdepartmentBase,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a subdepartment (admin or department manager only)"""
    db_subdepartment = db.query(models.Subdepartment)\
        .filter(models.Subdepartment.id == subdepartment_id)\
        .first()
    if not db_subdepartment:
        raise HTTPException(status_code=404, detail="Subdepartment not found")
    
    if not (current_user["role"] == "admin" or 
            (current_user["role"] == "manager" and 
             current_user["department_id"] == db_subdepartment.department_id)):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    for key, value in subdepartment.dict().items():
        setattr(db_subdepartment, key, value)
    db_subdepartment.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_subdepartment)
    return db_subdepartment

@router.delete("/subdepartments/{subdepartment_id}")
async def delete_subdepartment(
    subdepartment_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a subdepartment (admin or department manager only)"""
    subdepartment = db.query(models.Subdepartment)\
        .filter(models.Subdepartment.id == subdepartment_id)\
        .first()
    if not subdepartment:
        raise HTTPException(status_code=404, detail="Subdepartment not found")
    
    if not (current_user["role"] == "admin" or 
            (current_user["role"] == "manager" and 
             current_user["department_id"] == subdepartment.department_id)):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    db.delete(subdepartment)
    db.commit()
    return {"message": "Subdepartment deleted successfully"}

# Participation Endpoints
@router.get("/subdepartments/{subdepartment_id}/participants", 
            response_model=List[ParticipationResponse])
async def get_participants(
    subdepartment_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all participants of a subdepartment"""
    participations = db.query(models.SubdepartmentParticipation)\
        .filter(models.SubdepartmentParticipation.subdepartment_id == subdepartment_id)\
        .offset(skip)\
        .limit(limit)\
        .all()
    return participations

@router.post("/subdepartments/{subdepartment_id}/participants", 
             response_model=ParticipationResponse)
async def add_participant(
    subdepartment_id: int,
    participation: ParticipationBase,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a participant to a subdepartment"""
    subdepartment = db.query(models.Subdepartment)\
        .filter(models.Subdepartment.id == subdepartment_id)\
        .first()
    if not subdepartment:
        raise HTTPException(status_code=404, detail="Subdepartment not found")
    
    if not (current_user["role"] == "admin" or 
            current_user["id"] == subdepartment.manager_id):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    db_participation = models.SubdepartmentParticipation(
        subdepartment_id=subdepartment_id,
        **participation.dict()
    )
    db.add(db_participation)
    db.commit()
    db.refresh(db_participation)
    return db_participation

@router.delete("/subdepartments/{subdepartment_id}/participants/{user_id}")
async def remove_participant(
    subdepartment_id: int,
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a participant from a subdepartment"""
    participation = db.query(models.SubdepartmentParticipation)\
        .filter(
            models.SubdepartmentParticipation.subdepartment_id == subdepartment_id,
            models.SubdepartmentParticipation.user_id == user_id
        ).first()
    if not participation:
        raise HTTPException(status_code=404, detail="Participation not found")
    
    subdepartment = db.query(models.Subdepartment)\
        .filter(models.Subdepartment.id == subdepartment_id)\
        .first()
    
    if not (current_user["role"] == "admin" or 
            current_user["id"] == subdepartment.manager_id):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    db.delete(participation)
    db.commit()
    return {"message": "Participant removed successfully"} 