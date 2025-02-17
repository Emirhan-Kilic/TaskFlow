from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/comments", tags=["comments"])

class CommentBase(BaseModel):
    content: str
    task_id: int
    parent_id: Optional[int] = None
    mentions: Optional[List[int]] = None

class CommentCreate(CommentBase):
    pass

class CommentUpdate(BaseModel):
    content: str

@router.get("/task/{task_id}")
async def get_task_comments(
    task_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("comments").select("""
        id,
        content,
        task_id,
        parent_id,
        created_at,
        updated_at,
        author:user_id (
            id,
            display_name,
            profile_picture
        ),
        mentions (
            user_id,
            read
        )
    """).eq("task_id", task_id).order("created_at").execute()
    
    return response.data

@router.post("/")
async def create_comment(
    comment: CommentCreate,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    
    # Create the comment
    comment_data = {
        **comment.dict(exclude={'mentions'}),
        "user_id": current_user["id"],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    
    response = supabase.table("comments").insert(comment_data).execute()
    
    # Create mentions if any
    if comment.mentions:
        mentions_data = [
            {
                "comment_id": response.data[0]["id"],
                "user_id": user_id,
                "read": False,
                "created_at": datetime.now().isoformat()
            }
            for user_id in comment.mentions
        ]
        supabase.table("comment_mentions").insert(mentions_data).execute()
    
    return response.data

@router.put("/{comment_id}")
async def update_comment(
    comment_id: int,
    comment: CommentUpdate,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    
    # Verify ownership
    existing = supabase.table("comments")\
        .select("user_id")\
        .eq("id", comment_id)\
        .single()\
        .execute()
    
    if not existing.data or existing.data["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to edit this comment")
    
    response = supabase.table("comments").update({
        "content": comment.content,
        "updated_at": datetime.now().isoformat()
    }).eq("id", comment_id).execute()
    
    return response.data

@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    
    # Verify ownership or admin status
    if current_user["role"] != "admin":
        existing = supabase.table("comments")\
            .select("user_id")\
            .eq("id", comment_id)\
            .single()\
            .execute()
        
        if not existing.data or existing.data["user_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
    
    response = supabase.table("comments").delete().eq("id", comment_id).execute()
    return response.data 