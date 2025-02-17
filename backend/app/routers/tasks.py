from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from ..database import get_db
from ..models import tasks as models
from ..schemas import tasks as schemas
from ..auth import get_current_user
from pydantic import BaseModel, Field
from enum import Enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Text, BigInteger
from sqlalchemy.orm import relationship
import enum
from ..utils.storage import upload_file, delete_file
from sqlalchemy import and_, or_
from ..dependencies import get_current_user, get_supabase_client

router = APIRouter(prefix="/tasks", tags=["tasks"])

# Get tasks for kanban board
@router.get("/board", response_model=List[schemas.TaskResponse])
async def get_tasks_board(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
    assignee: Optional[str] = None,
    search: Optional[str] = None
):
    """Get all tasks for the kanban board with optional filtering"""
    query = db.query(models.Task).filter(
        models.Task.department_id == current_user.department_id
    )
    
    if assignee and assignee != 'all':
        query = query.join(models.TaskAssignment).filter(
            models.TaskAssignment.assigned_to == assignee
        )
        
    if search:
        query = query.filter(
            or_(
                models.Task.title.ilike(f"%{search}%"),
                models.Task.description.ilike(f"%{search}%")
            )
        )
    
    return query.all()

# Update task status
@router.patch("/{task_id}/status", response_model=schemas.TaskResponse)
async def update_task_status(
    task_id: int,
    status_update: schemas.TaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Update task status and create notifications"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    current_time = datetime.utcnow()
    progress = {
        'To Do': 0,
        'In Progress': 25,
        'Under Review': 75,
        'Completed': 100
    }[status_update.status]
    
    # Update all assignments
    for assignment in task.task_assignments:
        assignment.status = status_update.status
        assignment.progress = progress
        assignment.updated_at = current_time
        
        if status_update.status == 'In Progress' and not assignment.started_at:
            assignment.started_at = current_time
        elif status_update.status == 'Completed':
            assignment.completed_at = current_time
    
    # Update task version if completed
    if status_update.status == 'Completed':
        task.version += 1
        task.updated_at = current_time
    
    # Create notifications
    for assignment in task.task_assignments:
        notification = models.Notification(
            user_id=assignment.assigned_to,
            task_id=task_id,
            type='push',
            subject='Task Status Updated',
            message=f'Task status has been updated to {status_update.status} ({progress}% complete)'
        )
        db.add(notification)
    
    db.commit()
    db.refresh(task)
    return task

# Edit task details
@router.patch("/{task_id}", response_model=schemas.TaskResponse)
async def update_task(
    task_id: int,
    task_update: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Update task details including assignments"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update basic task info
    for key, value in task_update.dict(exclude_unset=True, exclude={'assignees'}).items():
        setattr(task, key, value)
    
    # Handle assignee changes if provided
    if task_update.assignees is not None:
        current_assignees = {str(a.assigned_to) for a in task.task_assignments}
        new_assignees = set(task_update.assignees)
        
        # Remove assignments
        for removed in current_assignees - new_assignees:
            db.query(models.TaskAssignment).filter(
                models.TaskAssignment.task_id == task_id,
                models.TaskAssignment.assigned_to == int(removed)
            ).delete()
        
        # Add new assignments
        for added in new_assignees - current_assignees:
            assignment = models.TaskAssignment(
                task_id=task_id,
                assigned_to=int(added),
                status='To Do',
                progress=0
            )
            db.add(assignment)
    
    db.commit()
    db.refresh(task)
    return task

# Bulk update task status
@router.patch("/bulk/status", response_model=List[schemas.TaskResponse])
async def bulk_update_status(
    update: schemas.BulkStatusUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Update status for multiple tasks at once"""
    tasks = []
    current_time = datetime.utcnow()
    
    for task_id in update.task_ids:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if task:
            for assignment in task.task_assignments:
                assignment.status = update.status
                assignment.updated_at = current_time
                
                if update.status == 'In Progress' and not assignment.started_at:
                    assignment.started_at = current_time
                elif update.status == 'Completed':
                    assignment.completed_at = current_time
            
            tasks.append(task)
    
    db.commit()
    return tasks

# Bulk assign tasks
@router.patch("/bulk/assign", response_model=List[schemas.TaskResponse])
async def bulk_assign_tasks(
    update: schemas.BulkAssignUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Assign multiple tasks to a user"""
    tasks = []
    current_time = datetime.utcnow()
    
    for task_id in update.task_ids:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if task:
            # Remove existing assignments
            db.query(models.TaskAssignment).filter(
                models.TaskAssignment.task_id == task_id
            ).delete()
            
            # Create new assignment
            assignment = models.TaskAssignment(
                task_id=task_id,
                assigned_to=update.user_id,
                status='To Do',
                progress=0,
                created_at=current_time,
                updated_at=current_time
            )
            db.add(assignment)
            tasks.append(task)
    
    db.commit()
    return tasks

class PriorityEnum(str, Enum):
    CRITICAL = 'Critical'
    HIGH = 'High'
    MEDIUM = 'Medium'
    LOW = 'Low'

class StatusEnum(str, Enum):
    TODO = 'To Do'
    IN_PROGRESS = 'In Progress'
    UNDER_REVIEW = 'Under Review'
    COMPLETED = 'Completed'

class UserBase(BaseModel):
    id: int
    display_name: str
    profile_picture: Optional[str]
    job_title: Optional[str]
    
    class Config:
        orm_mode = True

class TaskAssignmentBase(BaseModel):
    id: int
    status: StatusEnum
    progress: int
    comments: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    version: int
    created_at: datetime
    updated_at: datetime
    assigned_to: UserBase

    class Config:
        orm_mode = True

class TaskAttachmentBase(BaseModel):
    id: int
    file_name: str
    file_path: str
    file_url: str
    file_type: str
    file_size: int
    uploaded_at: datetime

    class Config:
        orm_mode = True

class TaskDependencyBase(BaseModel):
    id: int
    depends_on: int
    dependency_type: str

    class Config:
        orm_mode = True

class TaskBase(BaseModel):
    id: int
    title: str
    description: Optional[str]
    department_id: int
    created_by: int
    priority: PriorityEnum
    due_date: Optional[datetime]
    start_date: Optional[datetime]
    version: int
    template_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    subdepartment_id: Optional[int]
    uploaded_by: Optional[int]
    thumbnail_path: Optional[str]
    external_id: Optional[str]
    efficiency_ratio: Optional[float]
    quality_rating: Optional[float]

class TaskCreate(BaseModel):
    title: str
    description: Optional[str]
    priority: PriorityEnum
    start_date: Optional[datetime]
    due_date: Optional[datetime]
    assignees: List[str]
    dependencies: Optional[List[TaskDependencyBase]]

class TaskUpdate(BaseModel):
    title: Optional[str]
    description: Optional[str]
    priority: Optional[PriorityEnum]
    start_date: Optional[datetime]
    due_date: Optional[datetime]
    assignees: Optional[List[str]]

class TaskStatusUpdate(BaseModel):
    status: StatusEnum

class BulkStatusUpdate(BaseModel):
    task_ids: List[int]
    status: StatusEnum

class BulkAssignUpdate(BaseModel):
    task_ids: List[int]
    user_id: int

class TaskResponse(TaskBase):
    task_assignments: List[TaskAssignmentBase]
    task_attachments: Optional[List[TaskAttachmentBase]]
    task_dependencies: Optional[List[TaskDependencyBase]]
    created_by_user: UserBase

    class Config:
        orm_mode = True

class PriorityEnum(enum.Enum):
    Critical = 'Critical'
    High = 'High'
    Medium = 'Medium'
    Low = 'Low'

class StatusEnum(enum.Enum):
    TODO = 'To Do'
    IN_PROGRESS = 'In Progress'
    UNDER_REVIEW = 'Under Review'
    COMPLETED = 'Completed'

class Task(models.Base):
    __tablename__ = "tasks"

    id = Column(BigInteger, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    department_id = Column(BigInteger, ForeignKey("departments.id"), nullable=False)
    created_by = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    priority = Column(Enum(PriorityEnum), nullable=False)
    due_date = Column(DateTime)
    start_date = Column(DateTime)
    version = Column(Integer, default=1)
    template_id = Column(BigInteger, ForeignKey("task_templates.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    task_assignments = relationship("TaskAssignment", back_populates="task")
    task_attachments = relationship("TaskAttachment", back_populates="task")
    task_dependencies = relationship("TaskDependency", back_populates="task")
    created_by_user = relationship("User", foreign_keys=[created_by])
    department = relationship("Department")
    template = relationship("TaskTemplate")

class TaskAssignment(models.Base):
    __tablename__ = "task_assignments"

    id = Column(BigInteger, primary_key=True, index=True)
    task_id = Column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    assigned_to = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(StatusEnum), default=StatusEnum.TODO)
    progress = Column(Integer, default=0)
    comments = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    task = relationship("Task", back_populates="task_assignments")
    assigned_user = relationship("User", foreign_keys=[assigned_to])

class TaskAttachment(models.Base):
    __tablename__ = "task_attachments"

    id = Column(BigInteger, primary_key=True, index=True)
    task_id = Column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    task = relationship("Task", back_populates="task_attachments")

class TaskDependency(models.Base):
    __tablename__ = "task_dependencies"

    id = Column(BigInteger, primary_key=True, index=True)
    task_id = Column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    depends_on = Column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    dependency_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    task = relationship("Task", foreign_keys=[task_id], back_populates="task_dependencies")
    dependent_task = relationship("Task", foreign_keys=[depends_on])

class Notification(models.Base):
    __tablename__ = "notifications"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    task_id = Column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    type = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime)

    # Relationships
    user = relationship("User")
    task = relationship("Task")

@router.get("/")
async def get_tasks(
    department_id: Optional[int] = None,
    created_by: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("tasks").select("""
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
        department:departments!tasks_department_id_fkey (
            id,
            name
        ),
        creator:users!tasks_created_by_fkey (
            id,
            display_name,
            profile_picture
        ),
        template:task_templates (
            id,
            name
        ),
        task_assignments (
            id,
            assigned_to,
            status,
            progress
        )
    """)
    
    if department_id:
        query = query.eq("department_id", department_id)
    if created_by:
        query = query.eq("created_by", created_by)
    
    response = query.execute()
    return response.data

@router.post("/")
async def create_task(
    task: TaskBase,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("tasks").insert({
        **task.dict(),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }).execute()
    return response.data

@router.put("/{task_id}")
async def update_task(
    task_id: int,
    task: TaskBase,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Get current version
    current = supabase.table("tasks")\
        .select("version")\
        .eq("id", task_id)\
        .single()\
        .execute()
    
    if not current.data:
        raise HTTPException(status_code=404, detail="Task not found")
    
    response = supabase.table("tasks").update({
        **task.dict(),
        "version": current.data["version"] + 1,
        "updated_at": datetime.now().isoformat()
    }).eq("id", task_id).execute()
    return response.data

@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("tasks")\
        .delete()\
        .eq("id", task_id)\
        .execute()
    return response.data

@router.post("/{task_id}/attachments", response_model=schemas.TaskAttachmentBase)
async def add_attachment(
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Upload and attach a file to a task"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    file_url = await upload_file(file, f"tasks/{task_id}/attachments")
    
    attachment = models.TaskAttachment(
        task_id=task_id,
        file_name=file.filename,
        file_path=file_url,
        file_url=file_url,
        file_type=file.content_type,
        file_size=file.size
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment

@router.delete("/{task_id}/attachments/{attachment_id}")
async def remove_attachment(
    task_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Remove an attachment from a task"""
    attachment = db.query(models.TaskAttachment).filter(
        models.TaskAttachment.id == attachment_id,
        models.TaskAttachment.task_id == task_id
    ).first()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    await delete_file(attachment.file_path)
    db.delete(attachment)
    db.commit()
    return {"message": "Attachment removed successfully"}

@router.get("/dependencies/{task_id}", response_model=List[schemas.TaskDependencyBase])
async def get_task_dependencies(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get all dependencies for a task"""
    dependencies = db.query(models.TaskDependency).filter(
        models.TaskDependency.task_id == task_id
    ).all()
    return dependencies

# Add new endpoint to get task metrics
@router.get("/metrics", response_model=schemas.TaskMetricsResponse)
async def get_task_metrics(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
    department_id: Optional[int] = None
):
    """Get task metrics including backlog and performance data"""
    query = db.query(models.BacklogMetrics)
    if department_id:
        query = query.filter(models.BacklogMetrics.department_id == department_id)
    else:
        query = query.filter(models.BacklogMetrics.department_id == current_user.department_id)
    
    backlog = query.order_by(models.BacklogMetrics.measured_at.desc()).first()
    
    performance = db.query(models.PerformanceMetrics)\
        .filter(models.PerformanceMetrics.department_id == current_user.department_id)\
        .order_by(models.PerformanceMetrics.measured_at.desc())\
        .first()
    
    return {
        "backlog": backlog,
        "performance": performance
    }

# Add endpoint for calendar integration
@router.post("/{task_id}/calendar", response_model=schemas.CalendarEventResponse)
async def create_calendar_event(
    task_id: int,
    event: schemas.CalendarEventCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Create a calendar event for a task"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    calendar_event = models.CalendarEvent(
        task_id=task_id,
        user_id=current_user.id,
        external_id=event.external_id,
        start_time=event.start_time,
        end_time=event.end_time,
        service_type=event.service_type
    )
    db.add(calendar_event)
    db.commit()
    db.refresh(calendar_event)
    return calendar_event

# Add endpoint for subdepartment tasks
@router.get("/subdepartment/{subdepartment_id}", response_model=List[schemas.TaskResponse])
async def get_subdepartment_tasks(
    subdepartment_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get tasks for a specific subdepartment"""
    # Verify user has access to subdepartment
    participation = db.query(models.SubdepartmentParticipation)\
        .filter(
            models.SubdepartmentParticipation.subdepartment_id == subdepartment_id,
            models.SubdepartmentParticipation.user_id == current_user.id
        ).first()
    
    if not participation:
        raise HTTPException(status_code=403, detail="Not authorized for this subdepartment")
    
    tasks = db.query(models.Task)\
        .join(models.Subdepartment)\
        .filter(models.Subdepartment.id == subdepartment_id)\
        .all()
    
    return tasks

# Add new schema for metrics
class TaskMetricsResponse(BaseModel):
    backlog: Optional[BacklogMetricsBase]
    performance: Optional[PerformanceMetricsBase]
    
    class Config:
        orm_mode = True

class CalendarEventCreate(BaseModel):
    external_id: str
    start_time: datetime
    end_time: datetime
    service_type: str

class CalendarEventResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    external_id: str
    start_time: datetime
    end_time: datetime
    service_type: str
    sync_token: Optional[str]
    last_synced: Optional[datetime]
    created_at: datetime

    class Config:
        orm_mode = True

@router.get("/upcoming")
async def get_upcoming_tasks(
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    
    # Get upcoming deadlines (tasks due this week)
    today = datetime.now()
    today = today.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_week = today + timedelta(days=7)
    end_of_week = end_of_week.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    response = supabase.table("tasks").select("""
        id,
        title,
        description,
        priority,
        due_date,
        start_date,
        version,
        task_assignments!inner(
            id,
            status,
            progress,
            started_at,
            assigned_to(
                id,
                display_name,
                profile_picture,
                job_title
            )
        ),
        task_attachments(
            id,
            file_type,
            uploaded_at
        ),
        task_dependencies!task_dependencies_task_id_fkey(
            id,
            depends_on,
            dependency_type
        )
    """).gte("due_date", today.isoformat())\
       .lte("due_date", end_of_week.isoformat())\
       .order("due_date", {"ascending": True})\
       .execute()
    
    if response.error:
        raise HTTPException(status_code=400, detail=str(response.error))
    
    return response.data
