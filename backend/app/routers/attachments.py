from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from ..database import get_db
from . import models, schemas
from ..auth import get_current_user
from ..utils.storage import upload_file, delete_file, generate_presigned_url
from ..utils.file_processing import process_file_preview, get_file_metadata
import mimetypes
from sqlalchemy import func

router = APIRouter(prefix="/api/attachments", tags=["attachments"])

@router.post("/task/{task_id}", response_model=schemas.TaskAttachmentResponse)
async def upload_task_attachment(
    task_id: int,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Upload a new file attachment to a task"""
    # Verify task exists and user has access
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.department_id == current_user.department_id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get file metadata
    file_metadata = await get_file_metadata(file)
    file_size = file_metadata.get('size', 0)
    
    # Check file size limit (e.g., 100MB)
    if file_size > 100 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds maximum limit of 100MB"
        )
    
    # Generate unique filename
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    filename = f"{timestamp}_{file.filename}"
    
    # Upload file to storage
    file_path = f"tasks/{task_id}/attachments/{filename}"
    await upload_file(file, file_path)
    
    # Create attachment record
    attachment = models.TaskAttachment(
        task_id=task_id,
        file_path=file_path,
        file_type=file.content_type or mimetypes.guess_type(file.filename)[0],
        file_size=file_size,
        uploaded_by=current_user.id,
        uploaded_at=datetime.utcnow()
    )
    
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    
    # Generate thumbnail in background if it's an image or document
    if file_metadata.get('can_preview', False):
        background_tasks.add_task(
            process_file_preview,
            file_path,
            attachment.id,
            'thumbnail_path'
        )
    
    return attachment

@router.get("/task/{task_id}", response_model=List[schemas.TaskAttachmentResponse])
async def get_task_attachments(
    task_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get all attachments for a specific task with pagination"""
    attachments = db.query(models.TaskAttachment).join(models.Task).filter(
        models.TaskAttachment.task_id == task_id,
        models.Task.department_id == current_user.department_id
    ).order_by(models.TaskAttachment.uploaded_at.desc())\
    .offset(skip).limit(limit).all()
    
    return attachments

@router.get("/{attachment_id}", response_model=schemas.TaskAttachmentResponse)
async def get_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get a specific attachment by ID"""
    attachment = db.query(models.TaskAttachment).join(models.Task).filter(
        models.TaskAttachment.id == attachment_id,
        models.Task.department_id == current_user.department_id
    ).first()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    return attachment

@router.get("/{attachment_id}/download-url")
async def get_attachment_download_url(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Generate a temporary download URL for an attachment"""
    attachment = db.query(models.TaskAttachment).join(models.Task).filter(
        models.TaskAttachment.id == attachment_id,
        models.Task.department_id == current_user.department_id
    ).first()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    download_url = await generate_presigned_url(
        attachment.file_path,
        expiration=3600
    )
    
    return {"download_url": download_url}

@router.delete("/{attachment_id}")
async def delete_task_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Delete a task attachment"""
    attachment = db.query(models.TaskAttachment).join(models.Task).filter(
        models.TaskAttachment.id == attachment_id,
        models.Task.department_id == current_user.department_id
    ).first()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Delete file from storage
    await delete_file(attachment.file_path)
    
    # Delete thumbnail if exists
    if attachment.thumbnail_path:
        await delete_file(attachment.thumbnail_path)
    
    db.delete(attachment)
    db.commit()
    
    return {"message": "Attachment deleted successfully"}

@router.post("/bulk-delete")
async def bulk_delete_attachments(
    attachment_ids: List[int],
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Delete multiple attachments at once"""
    attachments = db.query(models.TaskAttachment).join(models.Task).filter(
        models.TaskAttachment.id.in_(attachment_ids),
        models.Task.department_id == current_user.department_id
    ).all()
    
    for attachment in attachments:
        await delete_file(attachment.file_path)
        if attachment.thumbnail_path:
            await delete_file(attachment.thumbnail_path)
        db.delete(attachment)
    
    db.commit()
    
    return {
        "message": f"Successfully deleted {len(attachments)} attachments",
        "deleted_count": len(attachments)
    }

@router.get("/stats/task/{task_id}")
async def get_task_attachment_stats(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get attachment statistics for a task"""
    stats = db.query(
        func.count(models.TaskAttachment.id).label('total_count'),
        func.sum(models.TaskAttachment.file_size).label('total_size')
    ).join(models.Task).filter(
        models.TaskAttachment.task_id == task_id,
        models.Task.department_id == current_user.department_id
    ).first()
    
    return {
        "total_attachments": stats.total_count or 0,
        "total_size_bytes": stats.total_size or 0
    }

@router.patch("/{attachment_id}", response_model=schemas.TaskAttachmentResponse)
async def update_attachment_metadata(
    attachment_id: int,
    metadata: schemas.AttachmentMetadataUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Update attachment metadata (e.g., filename, description)"""
    attachment = db.query(models.TaskAttachment).join(models.Task).filter(
        models.TaskAttachment.id == attachment_id,
        models.Task.department_id == current_user.department_id
    ).first()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    for key, value in metadata.dict(exclude_unset=True).items():
        setattr(attachment, key, value)
    
    attachment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(attachment)
    
    return attachment 