from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/task-attachments", tags=["task-attachments"])

class AttachmentBase(BaseModel):
    task_id: int
    file_path: str
    file_name: str  # This is kept for UI purposes though not in DB
    file_type: str
    file_size: int
    uploaded_by: int
    description: Optional[str] = None
    thumbnail_path: Optional[str] = None

@router.get("/")
async def get_task_attachments(
    task_id: Optional[int] = None,
    uploaded_by: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("task_attachments").select("""
        id,
        task_id,
        file_path,
        file_name,
        file_type,
        file_size,
        description,
        thumbnail_path,
        uploaded_by,
        uploaded_at,
        uploader:users!task_attachments_uploaded_by_fkey (
            id,
            display_name,
            profile_picture
        ),
        task:tasks!task_attachments_task_id_fkey (
            id,
            title
        )
    """)
    
    if task_id:
        query = query.eq("task_id", task_id)
    if uploaded_by:
        query = query.eq("uploaded_by", uploaded_by)
    
    response = query.execute()
    return response.data

@router.post("/upload")
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    description: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    try:
        supabase = get_supabase_client()
        file_content = await file.read()
        file_size = len(file_content)
        file_type = file.content_type
        
        # Generate unique file path
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = f"task_{task_id}/{timestamp}_{file.filename}"
        
        # Upload to storage
        storage_response = supabase.storage.from_("task-attachments")\
            .upload(file_path, file_content)
        
        if hasattr(storage_response, 'error') and storage_response.error:
            raise HTTPException(status_code=400, detail=str(storage_response.error))
        
        # Create attachment record
        attachment = AttachmentBase(
            task_id=task_id,
            file_path=file_path,
            file_name=file.filename,
            file_type=file_type,
            file_size=file_size,
            uploaded_by=current_user["id"],
            description=description
        )
        
        response = supabase.table("task_attachments").insert(attachment.dict()).execute()
        return response.data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    
    # Get attachment details
    attachment = supabase.table("task_attachments")\
        .select("*")\
        .eq("id", attachment_id)\
        .single()\
        .execute()
    
    if not attachment.data:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Verify ownership or admin status
    if current_user["role"] != "admin" and attachment.data["uploaded_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this attachment")
    
    # Delete from storage
    storage_response = supabase.storage.from_("task-attachments")\
        .remove([attachment.data["file_path"]])
    
    if hasattr(storage_response, 'error') and storage_response.error:
        raise HTTPException(status_code=400, detail=str(storage_response.error))
    
    # Delete record
    response = supabase.table("task_attachments")\
        .delete()\
        .eq("id", attachment_id)\
        .execute()
    
    return response.data

@router.get("/{attachment_id}")
async def get_task_attachment(
    attachment_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("task_attachments").select("""
        id,
        task_id,
        file_path,
        file_name,
        file_type,
        file_size,
        description,
        thumbnail_path,
        uploaded_by,
        uploaded_at,
        uploader:users!task_attachments_uploaded_by_fkey (
            id,
            display_name,
            profile_picture
        ),
        task:tasks!task_attachments_task_id_fkey (
            id,
            title
        )
    """).eq("id", attachment_id).single().execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    return response.data

@router.patch("/{attachment_id}")
async def update_attachment(
    attachment_id: int,
    description: Optional[str] = None,
    thumbnail_path: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    
    # Get attachment to check ownership
    attachment = supabase.table("task_attachments")\
        .select("*")\
        .eq("id", attachment_id)\
        .single()\
        .execute()
    
    if not attachment.data:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Verify ownership or admin status
    if current_user["role"] != "admin" and attachment.data["uploaded_by"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to update this attachment")
    
    update_data = {}
    if description is not None:
        update_data["description"] = description
    if thumbnail_path is not None:
        update_data["thumbnail_path"] = thumbnail_path
    
    response = supabase.table("task_attachments")\
        .update(update_data)\
        .eq("id", attachment_id)\
        .execute()
    
    return response.data

@router.post("/task/{task_id}/bulk")
async def upload_task_attachments(
    task_id: int,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload multiple file attachments to a task"""
    try:
        supabase = get_supabase_client()
        results = []
        for file in files:
            # Generate unique filename
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{task_id}/{timestamp}_{file.filename}"
            
            # Upload file to storage
            file_content = await file.read()
            file_size = len(file_content)
            
            # Create database record
            attachment_data = {
                "task_id": task_id,
                "file_path": filename,
                "file_type": file.content_type,
                "file_size": file_size,
                "uploaded_by": current_user["id"]
            }
            
            response = supabase.table("task_attachments").insert(attachment_data).execute()
            if hasattr(response, 'error') and response.error:
                raise HTTPException(status_code=400, detail=str(response.error))
            
            results.append(response.data[0])
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{task_id}/update")
async def update_task_attachments(
    task_id: int,
    removed_attachments: List[int],
    current_user: dict = Depends(get_current_user)
):
    """Update task attachments by handling removals"""
    supabase = get_supabase_client()
    
    # Delete removed attachments
    if removed_attachments:
        response = supabase.table("task_attachments")\
            .delete()\
            .in_("id", removed_attachments)\
            .execute()
            
    return {"message": "Attachments updated successfully"}

