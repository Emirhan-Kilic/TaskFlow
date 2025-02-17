class UserBasic(BaseModel):
    id: int
    email: str
    display_name: Optional[str]
    job_title: Optional[str]
    role: str
    department_id: Optional[int]
    profile_picture: Optional[str]

    class Config:
        orm_mode = True

class UserMetrics(BaseModel):
    tasks_completed: int
    avg_completion_time: timedelta
    efficiency_ratio: float
    quality_rating: float
    measured_at: datetime

    class Config:
        orm_mode = True

class UserRoleUpdate(BaseModel):
    user_id: int
    new_role: str 