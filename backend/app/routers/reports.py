from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..dependencies import get_current_user, get_supabase_client
from pydantic import BaseModel
from datetime import datetime, timedelta

router = APIRouter(prefix="/reports", tags=["reports"])

class ReportRequest(BaseModel):
    department_id: Optional[int] = None
    subdepartment_id: Optional[int] = None
    report_type: str  # 'performance', 'workload', 'completion', 'backlog', 'efficiency'
    time_range: str  # 'week', 'month', 'quarter', 'year'
    filters: Optional[dict] = None

@router.post("/generate")
async def generate_report(
    request: ReportRequest,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Calculate date range
    end_date = datetime.now()
    if request.time_range == "week":
        start_date = end_date - timedelta(days=7)
    elif request.time_range == "month":
        start_date = end_date - timedelta(days=30)
    elif request.time_range == "quarter":
        start_date = end_date - timedelta(days=90)
    else:  # year
        start_date = end_date - timedelta(days=365)
    
    # Fetch data based on report type
    if request.report_type == "performance":
        data = await fetch_performance_data(
            supabase, 
            start_date, 
            end_date, 
            request.department_id,
            request.subdepartment_id
        )
    elif request.report_type == "workload":
        data = await fetch_workload_data(
            supabase, 
            start_date, 
            end_date, 
            request.department_id,
            request.subdepartment_id
        )
    elif request.report_type == "completion":
        data = await fetch_completion_data(
            supabase, 
            start_date, 
            end_date, 
            request.department_id,
            request.subdepartment_id
        )
    elif request.report_type == "backlog":
        data = await fetch_backlog_data(
            supabase,
            start_date,
            end_date,
            request.department_id,
            request.subdepartment_id
        )
    elif request.report_type == "efficiency":
        data = await fetch_efficiency_data(
            supabase,
            start_date,
            end_date,
            request.department_id,
            request.subdepartment_id
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid report type")
    
    return {
        "report_type": request.report_type,
        "time_range": request.time_range,
        "generated_at": datetime.now().isoformat(),
        "data": data
    }

async def fetch_performance_data(supabase, start_date, end_date, department_id, subdepartment_id=None):
    query = supabase.table("performance_metrics")\
        .select("""
            *,
            user:users (
                id,
                display_name,
                job_title
            ),
            department:departments (
                id,
                name
            )
        """)\
        .gte("measured_at", start_date.isoformat())\
        .lte("measured_at", end_date.isoformat())
    
    if department_id:
        query = query.eq("department_id", department_id)
    
    response = query.execute()
    return response.data

async def fetch_workload_data(supabase, start_date, end_date, department_id, subdepartment_id=None):
    query = supabase.table("task_assignments")\
        .select("""
            id,
            status,
            progress,
            started_at,
            completed_at,
            comments,
            version,
            assigned_to:users (
                id,
                display_name,
                job_title
            ),
            task:tasks (
                id,
                title,
                description,
                priority,
                due_date,
                start_date,
                department:departments (
                    id,
                    name
                )
            )
        """)\
        .gte("created_at", start_date.isoformat())\
        .lte("created_at", end_date.isoformat())
    
    if department_id:
        query = query.eq("task.department_id", department_id)
    
    response = query.execute()
    return response.data

async def fetch_completion_data(supabase, start_date, end_date, department_id, subdepartment_id=None):
    query = supabase.table("tasks")\
        .select("""
            id,
            title,
            description,
            priority,
            due_date,
            start_date,
            version,
            department:departments (
                id,
                name
            ),
            task_assignments (
                id,
                status,
                progress,
                completed_at,
                assigned_to:users (
                    id,
                    display_name
                )
            )
        """)\
        .gte("created_at", start_date.isoformat())\
        .lte("created_at", end_date.isoformat())
    
    if department_id:
        query = query.eq("department_id", department_id)
    
    response = query.execute()
    return response.data

async def fetch_backlog_data(supabase, start_date, end_date, department_id, subdepartment_id=None):
    query = supabase.table("backlog_metrics")\
        .select("""
            *,
            department:departments (
                id,
                name
            )
        """)\
        .gte("measured_at", start_date.isoformat())\
        .lte("measured_at", end_date.isoformat())
    
    if department_id:
        query = query.eq("department_id", department_id)
    
    response = query.execute()
    return response.data

async def fetch_efficiency_data(supabase, start_date, end_date, department_id, subdepartment_id=None):
    # Combines performance metrics with backlog metrics for efficiency analysis
    performance_query = supabase.table("performance_metrics")\
        .select("*")\
        .gte("measured_at", start_date.isoformat())\
        .lte("measured_at", end_date.isoformat())
    
    backlog_query = supabase.table("backlog_metrics")\
        .select("*")\
        .gte("measured_at", start_date.isoformat())\
        .lte("measured_at", end_date.isoformat())
    
    if department_id:
        performance_query = performance_query.eq("department_id", department_id)
        backlog_query = backlog_query.eq("department_id", department_id)
    
    performance_data = performance_query.execute()
    backlog_data = backlog_query.execute()
    
    return {
        "performance_metrics": performance_data.data,
        "backlog_metrics": backlog_data.data
    }

@router.get("/departments/{department_id}/summary")
async def get_department_summary(
    department_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    # Fetch latest metrics for the department
    performance = supabase.table("performance_metrics")\
        .select("*")\
        .eq("department_id", department_id)\
        .order("measured_at", desc=True)\
        .limit(1)\
        .execute()
    
    backlog = supabase.table("backlog_metrics")\
        .select("*")\
        .eq("department_id", department_id)\
        .order("measured_at", desc=True)\
        .limit(1)\
        .execute()
    
    return {
        "performance": performance.data[0] if performance.data else None,
        "backlog": backlog.data[0] if backlog.data else None
    } 

class DepartmentStats(BaseModel):
    id: int
    name: str
    employeeCount: int
    taskStats: Dict[str, Any]
    performance: Dict[str, Any]

class ReportMetrics(BaseModel):
    completionRate: float
    efficiencyScore: float
    qualityRating: float

class SaveReportRequest(BaseModel):
    departmentId: int
    filePath: str
    fileName: str
    fileSize: int
    metrics: ReportMetrics

@router.get("/department-stats", response_model=DepartmentStats)
async def get_department_stats(current_user: dict = Depends(get_current_user)):
    """
    Fetch comprehensive department statistics including task and performance metrics
    """
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    supabase = get_supabase_client()
    
    # Get department info
    dept_response = supabase.table("departments")\
        .select("*")\
        .eq("id", current_user["department_id"])\
        .single()\
        .execute()
    
    if not dept_response.data:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Get employee count
    employee_count = supabase.table("users")\
        .select("id", count="exact")\
        .eq("department_id", current_user["department_id"])\
        .execute()
    
    # Get task statistics
    tasks_response = supabase.table("tasks")\
        .select("""
            id,
            status,
            priority,
            due_date,
            created_at,
            completed_at
        """)\
        .eq("department_id", current_user["department_id"])\
        .execute()
    
    # Calculate task stats
    now = datetime.now()
    tasks = tasks_response.data
    total_tasks = len(tasks)
    completed_tasks = sum(1 for task in tasks if task["status"] == "completed")
    overdue_tasks = sum(1 for task in tasks if task["due_date"] and 
                       datetime.fromisoformat(task["due_date"]) < now and 
                       task["status"] != "completed")
    
    # Priority breakdown
    priority_counts = {
        "Critical": 0,
        "High": 0,
        "Medium": 0,
        "Low": 0
    }
    for task in tasks:
        if task["priority"] in priority_counts:
            priority_counts[task["priority"]] += 1
    
    # Get performance metrics for last 30 days
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    performance_response = supabase.table("performance_metrics")\
        .select("*")\
        .eq("department_id", current_user["department_id"])\
        .gte("measured_at", thirty_days_ago)\
        .order("measured_at", desc=True)\
        .execute()
    
    # Calculate average performance metrics
    perf_metrics = performance_response.data
    avg_efficiency = sum(m["efficiency_ratio"] for m in perf_metrics) / len(perf_metrics) if perf_metrics else 0
    avg_quality = sum(m["quality_rating"] for m in perf_metrics) / len(perf_metrics) if perf_metrics else 0
    
    # Completion trend (last 7 days)
    completion_trend = []
    for i in range(7):
        date = now - timedelta(days=i)
        completed_on_date = sum(1 for task in tasks 
                              if task["completed_at"] and 
                              datetime.fromisoformat(task["completed_at"]).date() == date.date())
        completion_trend.append({
            "date": date.date().isoformat(),
            "completed": completed_on_date
        })
    
    return {
        "id": dept_response.data["id"],
        "name": dept_response.data["name"],
        "employeeCount": employee_count.count,
        "taskStats": {
            "total": total_tasks,
            "completed": completed_tasks,
            "overdue": overdue_tasks,
            "byPriority": priority_counts,
            "completionTrend": completion_trend
        },
        "performance": {
            "taskCompletionRate": (completed_tasks / total_tasks) if total_tasks > 0 else 0,
            "avgEfficiencyRatio": avg_efficiency,
            "avgQualityRating": avg_quality
        }
    }

@router.post("/generate")
async def generate_report(
    report_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """
    Generate report content based on department statistics and metrics
    """
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    dept_stats = report_data["departmentStats"]
    metrics = report_data["metrics"]
    
    # Generate report content with markdown formatting
    report_content = f"""
# Department Performance Report
## {dept_stats['name']}
Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

### Overview
- Total Employees: {dept_stats['employeeCount']}
- Total Tasks: {dept_stats['taskStats']['total']}
- Completion Rate: {metrics['completionRate']:.1f}%
- Overdue Rate: {metrics['overdueRate']:.1f}%

### Task Distribution
- Critical Tasks: {dept_stats['taskStats']['byPriority']['Critical']} ({(dept_stats['taskStats']['byPriority']['Critical'] / dept_stats['taskStats']['total'] * 100):.1f}%)
- High Priority: {dept_stats['taskStats']['byPriority']['High']} ({(dept_stats['taskStats']['byPriority']['High'] / dept_stats['taskStats']['total'] * 100):.1f}%)
- Medium Priority: {dept_stats['taskStats']['byPriority']['Medium']} ({(dept_stats['taskStats']['byPriority']['Medium'] / dept_stats['taskStats']['total'] * 100):.1f}%)
- Low Priority: {dept_stats['taskStats']['byPriority']['Low']} ({(dept_stats['taskStats']['byPriority']['Low'] / dept_stats['taskStats']['total'] * 100):.1f}%)

### Performance Metrics
- Average Efficiency Ratio: {dept_stats['performance']['avgEfficiencyRatio']:.2f}
- Average Quality Rating: {dept_stats['performance']['avgQualityRating']:.2f}
- Tasks per Employee: {metrics['avgTasksPerEmployee']:.1f}

### Risk Assessment
- Critical Task Rate: {metrics['criticalTaskRate']:.1f}%
- Current Overdue Tasks: {dept_stats['taskStats']['overdue']}

### Recommendations
{generate_recommendations(dept_stats, metrics)}
"""
    
    return report_content

@router.post("/save")
async def save_report(
    report_data: SaveReportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Save report metadata to database
    """
    if current_user["role"] not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    supabase = get_supabase_client()
    
    response = supabase.table("reports").insert({
        "department_id": report_data.departmentId,
        "file_path": report_data.filePath,
        "file_name": report_data.fileName,
        "file_size": report_data.fileSize,
        "metrics": report_data.metrics.dict(),
        "generated_by": current_user["id"],
        "generated_at": datetime.now().isoformat()
    }).execute()
    
    if hasattr(response, 'error') and response.error:
        raise HTTPException(status_code=400, detail=str(response.error))
    
    return response.data

def generate_recommendations(dept_stats: Dict[str, Any], metrics: Dict[str, Any]) -> str:
    """
    Generate recommendations based on department statistics and metrics
    """
    recommendations = []
    
    # Analyze completion rate
    if metrics["completionRate"] < 70:
        recommendations.append("- Consider implementing task prioritization training to improve completion rates")
    
    # Analyze overdue rate
    if metrics["overdueRate"] > 20:
        recommendations.append("- Review task allocation and deadline setting processes")
        recommendations.append("- Consider implementing a task tracking system for at-risk tasks")
    
    # Analyze workload distribution
    if metrics["avgTasksPerEmployee"] > 10:
        recommendations.append("- Review workload distribution among team members")
        recommendations.append("- Consider hiring additional staff or redistributing tasks")
    
    # Analyze critical tasks
    if metrics["criticalTaskRate"] > 30:
        recommendations.append("- Review task classification criteria")
        recommendations.append("- Implement better task prioritization system")
    
    # Default recommendation if everything looks good
    if not recommendations:
        recommendations.append("- Maintain current performance levels")
        recommendations.append("- Consider setting more challenging targets")
    
    return "\n".join(recommendations)