from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy import func
from ..database import get_db
from . import models, schemas
from ..auth import get_current_user
from statistics import mean
from ..utils.time import calculate_duration_days

router = APIRouter(prefix="/api/templates", tags=["templates"])

@router.get("/", response_model=List[schemas.TaskTemplateResponse])
async def get_templates(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
    department_id: Optional[int] = None
):
    """Get all task templates with optional department filtering"""
    query = db.query(models.TaskTemplate)
    
    if department_id:
        query = query.filter(models.TaskTemplate.department_id == department_id)
    else:
        query = query.filter(models.TaskTemplate.department_id == current_user.department_id)
    
    templates = query.order_by(models.TaskTemplate.name).all()
    
    # Add usage statistics
    for template in templates:
        template.usage_count = db.query(func.count(models.Task.id)).filter(
            models.Task.template_id == template.id
        ).scalar()
        
        template.success_rate = db.query(
            func.avg(
                func.case(
                    [(models.TaskAssignment.status == 'Completed', 1)],
                    else_=0
                )
            )
        ).join(models.Task).filter(
            models.Task.template_id == template.id
        ).scalar() or 0
        
    return templates

@router.post("/", response_model=schemas.TaskTemplateResponse)
async def create_template(
    template: schemas.TaskTemplateCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Create a new task template"""
    db_template = models.TaskTemplate(
        **template.dict(exclude={'default_assignees', 'dependencies'}),
        created_by=current_user.id,
        department_id=current_user.department_id
    )
    db.add(db_template)
    db.flush()
    
    # Add default assignee roles if specified
    if template.default_assignees:
        for role in template.default_assignees:
            assignee = models.TemplateAssignee(
                template_id=db_template.id,
                role=role
            )
            db.add(assignee)
    
    # Add dependencies if specified
    if template.dependencies:
        for dep in template.dependencies:
            dependency = models.TemplateDependency(
                template_id=db_template.id,
                depends_on_template=dep.depends_on_template,
                dependency_type=dep.dependency_type
            )
            db.add(dependency)
    
    db.commit()
    db.refresh(db_template)
    return db_template

@router.get("/{template_id}", response_model=schemas.TaskTemplateDetail)
async def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get detailed information about a specific template"""
    template = db.query(models.TaskTemplate).filter(
        models.TaskTemplate.id == template_id,
        models.TaskTemplate.department_id == current_user.department_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get usage statistics
    template.usage_count = db.query(func.count(models.Task.id)).filter(
        models.Task.template_id == template_id
    ).scalar()
    
    template.success_rate = db.query(
        func.avg(
            func.case(
                [(models.TaskAssignment.status == 'Completed', 1)],
                else_=0
            )
        )
    ).join(models.Task).filter(
        models.Task.template_id == template_id
    ).scalar() or 0
    
    # Get average completion time
    completion_times = db.query(
        func.avg(
            func.extract('epoch', models.TaskAssignment.completed_at) - 
            func.extract('epoch', models.TaskAssignment.started_at)
        )
    ).join(models.Task).filter(
        models.Task.template_id == template_id,
        models.TaskAssignment.completed_at.isnot(None),
        models.TaskAssignment.started_at.isnot(None)
    ).scalar()
    
    template.avg_completion_time = completion_times / 86400 if completion_times else None  # Convert to days
    
    return template

@router.patch("/{template_id}", response_model=schemas.TaskTemplateResponse)
async def update_template(
    template_id: int,
    template_update: schemas.TaskTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Update an existing task template"""
    template = db.query(models.TaskTemplate).filter(
        models.TaskTemplate.id == template_id,
        models.TaskTemplate.department_id == current_user.department_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Update basic template info
    for key, value in template_update.dict(exclude={'default_assignees', 'dependencies'}).items():
        if value is not None:
            setattr(template, key, value)
    
    # Update default assignees if provided
    if template_update.default_assignees is not None:
        # Remove existing assignees
        db.query(models.TemplateAssignee).filter(
            models.TemplateAssignee.template_id == template_id
        ).delete()
        
        # Add new assignees
        for role in template_update.default_assignees:
            assignee = models.TemplateAssignee(
                template_id=template_id,
                role=role
            )
            db.add(assignee)
    
    # Update dependencies if provided
    if template_update.dependencies is not None:
        # Remove existing dependencies
        db.query(models.TemplateDependency).filter(
            models.TemplateDependency.template_id == template_id
        ).delete()
        
        # Add new dependencies
        for dep in template_update.dependencies:
            dependency = models.TemplateDependency(
                template_id=template_id,
                depends_on_template=dep.depends_on_template,
                dependency_type=dep.dependency_type
            )
            db.add(dependency)
    
    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)
    return template

@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Delete a task template"""
    template = db.query(models.TaskTemplate).filter(
        models.TaskTemplate.id == template_id,
        models.TaskTemplate.department_id == current_user.department_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check if template is in use
    tasks_using_template = db.query(models.Task).filter(
        models.Task.template_id == template_id
    ).count()
    
    if tasks_using_template > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Template is in use by {tasks_using_template} tasks and cannot be deleted"
        )
    
    db.delete(template)
    db.commit()
    return {"message": "Template deleted successfully"}

@router.get("/{template_id}/tasks", response_model=List[schemas.TaskResponse])
async def get_template_tasks(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get all tasks created from a specific template"""
    tasks = db.query(models.Task).filter(
        models.Task.template_id == template_id,
        models.Task.department_id == current_user.department_id
    ).order_by(models.Task.created_at.desc()).all()
    
    return tasks

@router.get("/stats", response_model=Dict[str, Any])
async def get_template_statistics(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get aggregated statistics for all templates in the department"""
    templates = db.query(models.TaskTemplate).filter(
        models.TaskTemplate.department_id == current_user.department_id
    ).all()
    
    stats = {
        "total_templates": len(templates),
        "templates_by_priority": {},
        "avg_estimated_duration": None,
        "most_used_template": None
    }
    
    if templates:
        # Calculate priority distribution
        priority_counts = db.query(
            models.TaskTemplate.default_priority,
            func.count()
        ).group_by(models.TaskTemplate.default_priority).all()
        stats["templates_by_priority"] = {p[0]: p[1] for p in priority_counts}
        
        # Calculate average estimated duration
        durations = [t.estimated_duration.total_seconds() for t in templates if t.estimated_duration]
        if durations:
            stats["avg_estimated_duration"] = mean(durations) / 86400  # Convert to days
    
    return stats

@router.get("/{template_id}/performance", response_model=Dict[str, Any])
async def get_template_performance(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get detailed performance metrics for a specific template"""
    template = db.query(models.TaskTemplate).filter(
        models.TaskTemplate.id == template_id,
        models.TaskTemplate.department_id == current_user.department_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get tasks and their assignments
    tasks = db.query(models.Task).filter(models.Task.template_id == template_id).all()
    
    performance = {
        "total_tasks": len(tasks),
        "completion_rate": 0,
        "avg_completion_time": None,
        "priority_distribution": {},
        "status_distribution": {}
    }
    
    if tasks:
        # Calculate completion rate and times
        completed_tasks = [t for t in tasks if any(a.status == 'Completed' for a in t.assignments)]
        performance["completion_rate"] = len(completed_tasks) / len(tasks)
        
        # Priority distribution
        priority_counts = db.query(
            models.Task.priority,
            func.count()
        ).filter(models.Task.template_id == template_id).group_by(
            models.Task.priority
        ).all()
        performance["priority_distribution"] = {p[0]: p[1] for p in priority_counts}
        
        # Status distribution
        status_counts = db.query(
            models.TaskAssignment.status,
            func.count()
        ).join(models.Task).filter(
            models.Task.template_id == template_id
        ).group_by(models.TaskAssignment.status).all()
        performance["status_distribution"] = {s[0]: s[1] for s in status_counts}
    
    return performance

@router.post("/{template_id}/clone", response_model=schemas.TaskTemplateResponse)
async def clone_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Clone an existing template"""
    original = db.query(models.TaskTemplate).filter(
        models.TaskTemplate.id == template_id,
        models.TaskTemplate.department_id == current_user.department_id
    ).first()
    
    if not original:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Create new template with copied attributes
    new_template = models.TaskTemplate(
        name=f"{original.name} (Copy)",
        description=original.description,
        default_priority=original.default_priority,
        estimated_duration=original.estimated_duration,
        department_id=original.department_id,
        created_by=current_user.id
    )
    db.add(new_template)
    db.flush()
    
    # Copy assignees
    for assignee in original.default_assignees:
        new_assignee = models.TemplateAssignee(
            template_id=new_template.id,
            role=assignee.role
        )
        db.add(new_assignee)
    
    # Copy dependencies
    for dep in original.dependencies:
        new_dep = models.TemplateDependency(
            template_id=new_template.id,
            depends_on_template=dep.depends_on_template,
            dependency_type=dep.dependency_type
        )
        db.add(new_dep)
    
    db.commit()
    db.refresh(new_template)
    return new_template 