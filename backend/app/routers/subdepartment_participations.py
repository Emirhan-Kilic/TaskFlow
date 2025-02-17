from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(
    prefix="/subdepartment-participations", 
    tags=["subdepartment-participations"]
)

class ParticipationBase(BaseModel):
    subdepartment_id: int
    user_id: int
    role: str

class ParticipationResponse(ParticipationBase):
    id: int
    joined_at: datetime

@router.get("/", response_model=List[ParticipationResponse])
async def get_participations(
    subdepartment_id: Optional[int] = None,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("subdepartmentParticipations").select("""
        id,
        subdepartment_id,
        user_id,
        role,
        joined_at,
        user:user_id (
            id,
            display_name,
            profile_picture,
            job_title
        ),
        subdepartment:subdepartment_id (
            id,
            name,
            description
        )
    """)
    
    if subdepartment_id:
        query = query.eq("subdepartment_id", subdepartment_id)
    if user_id:
        query = query.eq("user_id", user_id)
    if role:
        query = query.eq("role", role)
    
    query = query.order("joined_at", desc=True)
    
    response = query.execute()
    return response.data

@router.get("/{participation_id}", response_model=ParticipationResponse)
async def get_participation(
    participation_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("subdepartmentParticipations").select("""
        *,
        user:user_id (
            id,
            display_name,
            profile_picture,
            job_title
        ),
        subdepartment:subdepartment_id (
            id,
            name,
            description
        )
    """).eq("id", participation_id).single().execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Participation not found")
    
    return response.data

@router.post("/")
async def create_participation(
    participation: ParticipationBase,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Check if participation already exists
    existing = supabase.table("subdepartmentParticipations")\
        .select("id")\
        .eq("subdepartment_id", participation.subdepartment_id)\
        .eq("user_id", participation.user_id)\
        .execute()
    
    if existing.data:
        raise HTTPException(
            status_code=400, 
            detail="User is already a member of this subdepartment"
        )
    
    response = supabase.table("subdepartmentParticipations").insert({
        **participation.dict(),
        "joined_at": datetime.now().isoformat()
    }).execute()
    
    return response.data

@router.put("/{participation_id}")
async def update_participation(
    participation_id: int,
    participation: ParticipationBase,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Check if participation exists
    existing = supabase.table("subdepartmentParticipations")\
        .select("id")\
        .eq("id", participation_id)\
        .execute()
    
    if not existing.data:
        raise HTTPException(status_code=404, detail="Participation not found")
    
    # Check if new combination would violate unique constraint
    if existing.data:
        check_unique = supabase.table("subdepartmentParticipations")\
            .select("id")\
            .eq("subdepartment_id", participation.subdepartment_id)\
            .eq("user_id", participation.user_id)\
            .neq("id", participation_id)\
            .execute()
        
        if check_unique.data:
            raise HTTPException(
                status_code=400,
                detail="User is already a member of this subdepartment"
            )
    
    response = supabase.table("subdepartmentParticipations")\
        .update(participation.dict())\
        .eq("id", participation_id)\
        .execute()
    
    return response.data

@router.get("/by-subdepartment/{subdepartment_id}", response_model=List[ParticipationResponse])
async def get_subdepartment_members(
    subdepartment_id: int,
    role: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    query = supabase.table("subdepartmentParticipations").select("""
        *,
        user:user_id (
            id,
            display_name,
            profile_picture,
            job_title
        )
    """).eq("subdepartment_id", subdepartment_id)
    
    if role:
        query = query.eq("role", role)
    
    response = query.execute()
    return response.data

@router.get("/by-user/{user_id}", response_model=List[ParticipationResponse])
async def get_user_subdepartments(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_client()
    response = supabase.table("subdepartmentParticipations").select("""
        *,
        subdepartment:subdepartment_id (
            id,
            name,
            description,
            department_id
        )
    """).eq("user_id", user_id).execute()
    
    return response.data

@router.delete("/{participation_id}")
async def delete_participation(
    participation_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    response = supabase.table("subdepartmentParticipations")\
        .delete()\
        .eq("id", participation_id)\
        .execute()
    
    return response.data 