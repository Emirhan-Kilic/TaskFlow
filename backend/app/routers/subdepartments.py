from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from sqlalchemy import func, and_, or_
from ..database import get_db
from . import models, schemas
from ..auth import get_current_user, has_department_access
from ..dependencies import get_supabase_client
from pydantic import BaseModel

router = APIRouter(prefix="/api/subdepartments", tags=["subdepartments"])

class SubdepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    department_id: int
    manager_id: Optional[int] = None
    employee_count: int = 0
    parent_id: Optional[int] = None

class SubdepartmentCreate(SubdepartmentBase):
    pass

class SubdepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    manager_id: Optional[int] = None
    parent_id: Optional[int] = None

class ParticipationCreate(BaseModel):
    user_id: int
    subdepartment_id: int
    role: str = 'member'

class ParticipationUpdate(BaseModel):
    role: str

@router.get("/", response_model=List[schemas.SubDepartmentResponse])
async def get_subdepartments(
    parent_id: Optional[int] = None,
    include_metrics: bool = False,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get all subdepartments under a department or parent subdepartment"""
    query = db.query(models.SubDepartment)
    
    if parent_id:
        query = query.filter(models.SubDepartment.parent_id == parent_id)
    else:
        query = query.filter(
            models.SubDepartment.department_id == current_user.department_id,
            models.SubDepartment.parent_id.is_(None)
        )
    
    subdepartments = query.all()
    
    if include_metrics:
        for subdept in subdepartments:
            # Get all tasks in subdepartment and its children
            task_count = get_recursive_task_count(db, subdept.id)
            member_count = get_recursive_member_count(db, subdept.id)
            completion_rate = calculate_completion_rate(db, subdept.id)
            
            subdept.metrics = {
                "total_tasks": task_count,
                "total_members": member_count,
                "completion_rate": completion_rate
            }
    
    return subdepartments

@router.post("/", response_model=schemas.SubDepartmentResponse)
async def create_subdepartment(
    subdepartment: schemas.SubDepartmentCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Create a new subdepartment"""
    # Verify parent department access if specified
    if subdepartment.parent_id:
        parent = db.query(models.SubDepartment).filter(
            models.SubDepartment.id == subdepartment.parent_id,
            models.SubDepartment.department_id == current_user.department_id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent subdepartment not found")
    
    db_subdepartment = models.SubDepartment(
        **subdepartment.dict(),
        department_id=current_user.department_id,
        created_by=current_user.id,
        created_at=datetime.utcnow()
    )
    
    db.add(db_subdepartment)
    db.commit()
    db.refresh(db_subdepartment)
    return db_subdepartment

@router.get("/{subdept_id}", response_model=schemas.SubDepartmentDetail)
async def get_subdepartment(
    subdept_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get detailed information about a specific subdepartment"""
    subdept = db.query(models.SubDepartment).filter(
        models.SubDepartment.id == subdept_id,
        models.SubDepartment.department_id == current_user.department_id
    ).first()
    
    if not subdept:
        raise HTTPException(status_code=404, detail="Subdepartment not found")
    
    # Get hierarchy information
    parent_chain = get_parent_chain(db, subdept_id)
    children = get_immediate_children(db, subdept_id)
    
    # Get metrics
    task_metrics = get_subdepartment_metrics(db, subdept_id)
    member_metrics = get_member_metrics(db, subdept_id)
    
    return {
        **subdept.__dict__,
        "parent_chain": parent_chain,
        "children": children,
        "metrics": {
            "tasks": task_metrics,
            "members": member_metrics
        }
    }

@router.patch("/{subdept_id}", response_model=schemas.SubDepartmentResponse)
async def update_subdepartment(
    subdept_id: int,
    subdept_update: schemas.SubDepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Update a subdepartment"""
    subdept = db.query(models.SubDepartment).filter(
        models.SubDepartment.id == subdept_id,
        models.SubDepartment.department_id == current_user.department_id
    ).first()
    
    if not subdept:
        raise HTTPException(status_code=404, detail="Subdepartment not found")
    
    # Verify new parent if changing
    if subdept_update.parent_id and subdept_update.parent_id != subdept.parent_id:
        # Prevent circular references
        if subdept_update.parent_id == subdept_id:
            raise HTTPException(status_code=400, detail="Cannot set subdepartment as its own parent")
        
        if is_descendant(db, subdept_id, subdept_update.parent_id):
            raise HTTPException(status_code=400, detail="Cannot set a descendant as parent")
    
    for key, value in subdept_update.dict(exclude_unset=True).items():
        setattr(subdept, key, value)
    
    subdept.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(subdept)
    return subdept

@router.delete("/{subdept_id}")
async def delete_subdepartment(
    subdept_id: int,
    reassign_to: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Delete a subdepartment and optionally reassign members and tasks"""
    subdept = db.query(models.SubDepartment).filter(
        models.SubDepartment.id == subdept_id,
        models.SubDepartment.department_id == current_user.department_id
    ).first()
    
    if not subdept:
        raise HTTPException(status_code=404, detail="Subdepartment not found")
    
    # Check if subdepartment has members or tasks
    has_dependencies = (
        db.query(models.User).filter(models.User.subdepartment_id == subdept_id).first() or
        db.query(models.Task).filter(models.Task.subdepartment_id == subdept_id).first()
    )
    
    if has_dependencies and not reassign_to:
        raise HTTPException(
            status_code=400,
            detail="Subdepartment has members or tasks. Specify reassign_to parameter to move them."
        )
    
    if reassign_to:
        target_subdept = db.query(models.SubDepartment).filter(
            models.SubDepartment.id == reassign_to,
            models.SubDepartment.department_id == current_user.department_id
        ).first()
        
        if not target_subdept:
            raise HTTPException(status_code=404, detail="Target subdepartment not found")
        
        # Reassign members and tasks
        db.query(models.User).filter(
            models.User.subdepartment_id == subdept_id
        ).update({"subdepartment_id": reassign_to})
        
        db.query(models.Task).filter(
            models.Task.subdepartment_id == subdept_id
        ).update({"subdepartment_id": reassign_to})
    
    db.delete(subdept)
    db.commit()
    
    return {"message": "Subdepartment deleted successfully"}

@router.get("/{subdept_id}/members", response_model=List[schemas.UserResponse])
async def get_subdepartment_members(
    subdept_id: int,
    include_children: bool = False,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get all members of a subdepartment"""
    if include_children:
        subdept_ids = get_all_descendant_ids(db, subdept_id)
        subdept_ids.append(subdept_id)
        members = db.query(models.User).filter(
            models.User.subdepartment_id.in_(subdept_ids)
        ).all()
    else:
        members = db.query(models.User).filter(
            models.User.subdepartment_id == subdept_id
        ).all()
    
    return members

# Helper functions
def get_recursive_task_count(db: Session, subdept_id: int) -> int:
    """Get total number of tasks in subdepartment and its children"""
    subdept_ids = get_all_descendant_ids(db, subdept_id)
    subdept_ids.append(subdept_id)
    return db.query(models.Task).filter(
        models.Task.subdepartment_id.in_(subdept_ids)
    ).count()

def get_recursive_member_count(db: Session, subdept_id: int) -> int:
    """Get total number of members in subdepartment and its children"""
    subdept_ids = get_all_descendant_ids(db, subdept_id)
    subdept_ids.append(subdept_id)
    return db.query(models.User).filter(
        models.User.subdepartment_id.in_(subdept_ids)
    ).count()

def calculate_completion_rate(db: Session, subdept_id: int) -> float:
    """Calculate task completion rate for subdepartment"""
    subdept_ids = get_all_descendant_ids(db, subdept_id)
    subdept_ids.append(subdept_id)
    
    total_tasks = db.query(models.Task).filter(
        models.Task.subdepartment_id.in_(subdept_ids)
    ).count()
    
    if total_tasks == 0:
        return 0
    
    completed_tasks = db.query(models.Task).filter(
        models.Task.subdepartment_id.in_(subdept_ids),
        models.Task.status == 'Completed'
    ).count()
    
    return (completed_tasks / total_tasks) * 100

def get_all_descendant_ids(db: Session, subdept_id: int) -> List[int]:
    """Get IDs of all descendant subdepartments"""
    descendants = []
    children = db.query(models.SubDepartment).filter(
        models.SubDepartment.parent_id == subdept_id
    ).all()
    
    for child in children:
        descendants.append(child.id)
        descendants.extend(get_all_descendant_ids(db, child.id))
    
    return descendants

def is_descendant(db: Session, parent_id: int, child_id: int) -> bool:
    """Check if one subdepartment is a descendant of another"""
    descendant_ids = get_all_descendant_ids(db, parent_id)
    return child_id in descendant_ids

@router.get("/")
async def get_subdepartments_supabase(
    department_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("subdepartments").select("""
        *,
        manager:manager_id (
            id,
            display_name,
            job_title,
            profile_picture,
            role
        )
    """)
    
    if department_id:
        query = query.eq("department_id", department_id)
    
    response = query.execute()
    return response.data

@router.post("/")
async def create_subdepartment_supabase(
    subdepartment: SubdepartmentCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("subdepartments").insert({
        **subdepartment.dict(),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }).execute()
    return response.data

@router.post("/participations")
async def create_participation(
    participation: ParticipationCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Check if participation already exists
    existing = supabase.table("subdepartmentparticipations").select("*")\
        .eq("user_id", participation.user_id)\
        .eq("subdepartment_id", participation.subdepartment_id)\
        .execute()
    
    if existing.data:
        raise HTTPException(status_code=400, detail="User already in subdepartment")
    
    response = supabase.table("subdepartmentparticipations")\
        .insert(participation.dict())\
        .execute()
    return response.data

@router.get("/{subdept_id}/participations", response_model=List[schemas.ParticipationResponse])
async def get_subdepartment_participations(
    subdept_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get all participation records for a subdepartment"""
    participations = db.query(models.SubdepartmentParticipation).filter(
        models.SubdepartmentParticipation.subdepartment_id == subdept_id
    ).all()
    return participations

@router.patch("/participations/{participation_id}")
async def update_participation(
    participation_id: int,
    participation: ParticipationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a participation record (e.g., change role)"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("subdepartmentparticipations")\
        .update(participation.dict())\
        .eq("id", participation_id)\
        .execute()
    return response.data

@router.delete("/participations/{participation_id}")
async def delete_participation(
    participation_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Remove a user from a subdepartment"""
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("subdepartmentparticipations")\
        .delete()\
        .eq("id", participation_id)\
        .execute()
    return {"message": "Participation removed successfully"}

@router.get("/{subdept_id}/tasks", response_model=List[schemas.TaskResponse])
async def get_subdepartment_tasks(
    subdept_id: int,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    include_children: bool = False,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get all tasks assigned to a subdepartment"""
    query = db.query(models.Task)
    
    if include_children:
        subdept_ids = get_all_descendant_ids(db, subdept_id)
        subdept_ids.append(subdept_id)
        query = query.filter(models.Task.subdepartment_id.in_(subdept_ids))
    else:
        query = query.filter(models.Task.subdepartment_id == subdept_id)
    
    if status:
        query = query.filter(models.Task.status == status)
    if priority:
        query = query.filter(models.Task.priority == priority)
    
    return query.all()

@router.post("/assign-member")
async def assign_member(
    subdepartment_id: int,
    user_id: int,
    role: str = "member",
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("subdepartmentparticipations").insert({
        "subdepartment_id": subdepartment_id,
        "user_id": user_id,
        "role": role,
        "joined_at": datetime.now().isoformat()
    }).execute()
    return response.data

@router.post("/assign-manager")
async def assign_manager(
    subdepartment_id: int,
    manager_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("subdepartments").update({
        "manager_id": manager_id,
        "updated_at": datetime.now().isoformat()
    }).eq("id", subdepartment_id).execute()
    return response.data

@router.delete("/remove-member")
async def remove_member(
    subdepartment_id: int,
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("subdepartmentparticipations")\
        .delete()\
        .eq("subdepartment_id", subdepartment_id)\
        .eq("user_id", user_id)\
        .execute()
    return response.data