from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from sqlalchemy import func, case, extract, and_, or_
from ..database import get_db
from . import models, schemas
from ..auth import get_current_user
from ..utils.date import get_date_range, get_period_start_date

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/department/overview", response_model=schemas.DepartmentAnalytics)
async def get_department_analytics(
    period: str = Query("month", enum=["week", "month", "quarter", "year"]),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get comprehensive department analytics"""
    start_date = get_period_start_date(period)
    
    # Task completion metrics
    completion_metrics = db.query(
        func.count(models.Task.id).label('total_tasks'),
        func.sum(case([(models.TaskAssignment.status == 'Completed', 1)], else_=0)).label('completed_tasks'),
        func.avg(case([(models.TaskAssignment.status == 'Completed', 1)], else_=0) * 100).label('completion_rate')
    ).join(models.TaskAssignment).filter(
        models.Task.department_id == current_user.department_id,
        models.Task.created_at >= start_date
    ).first()
    
    # Task distribution by priority
    priority_distribution = db.query(
        models.Task.priority,
        func.count(models.Task.id)
    ).filter(
        models.Task.department_id == current_user.department_id,
        models.Task.created_at >= start_date
    ).group_by(models.Task.priority).all()
    
    # Average completion time by priority
    avg_completion_times = db.query(
        models.Task.priority,
        func.avg(
            func.extract('epoch', models.TaskAssignment.completed_at) - 
            func.extract('epoch', models.TaskAssignment.started_at)
        ).label('avg_time')
    ).join(models.TaskAssignment).filter(
        models.Task.department_id == current_user.department_id,
        models.TaskAssignment.completed_at.isnot(None),
        models.TaskAssignment.started_at.isnot(None),
        models.Task.created_at >= start_date
    ).group_by(models.Task.priority).all()
    
    # Team performance metrics
    team_performance = db.query(
        models.User.id,
        models.User.display_name,
        func.count(models.TaskAssignment.id).label('total_tasks'),
        func.sum(case([(models.TaskAssignment.status == 'Completed', 1)], else_=0)).label('completed_tasks'),
        func.avg(models.TaskAssignment.progress).label('avg_progress')
    ).join(models.TaskAssignment).filter(
        models.User.department_id == current_user.department_id,
        models.TaskAssignment.created_at >= start_date
    ).group_by(models.User.id, models.User.display_name).all()
    
    # Add check for efficiency_ratio and quality_rating from performance_metrics
    performance_stats = db.query(
        func.avg(models.PerformanceMetrics.efficiency_ratio).label('avg_efficiency'),
        func.avg(models.PerformanceMetrics.quality_rating).label('avg_quality')
    ).filter(
        models.PerformanceMetrics.department_id == current_user.department_id,
        models.PerformanceMetrics.measured_at >= start_date
    ).first()
    
    # Add backlog metrics
    backlog_stats = db.query(
        models.BacklogMetrics
    ).filter(
        models.BacklogMetrics.department_id == current_user.department_id
    ).order_by(models.BacklogMetrics.measured_at.desc()).first()
    
    return {
        "period": period,
        "completion_metrics": {
            "total_tasks": completion_metrics.total_tasks or 0,
            "completed_tasks": completion_metrics.completed_tasks or 0,
            "completion_rate": completion_metrics.completion_rate or 0
        },
        "priority_distribution": dict(priority_distribution),
        "avg_completion_times": {
            priority: timedelta(seconds=avg_time) if avg_time else None
            for priority, avg_time in avg_completion_times
        },
        "team_performance": [
            {
                "user_id": user.id,
                "display_name": user.display_name,
                "total_tasks": metrics.total_tasks,
                "completed_tasks": metrics.completed_tasks,
                "avg_progress": metrics.avg_progress
            }
            for user, metrics in team_performance
        ],
        "performance_metrics": {
            "avg_efficiency": performance_stats.avg_efficiency if performance_stats else 0,
            "avg_quality": performance_stats.avg_quality if performance_stats else 0,
            "overdue_tasks": backlog_stats.overdue_tasks if backlog_stats else 0,
            "high_priority_backlog": backlog_stats.high_priority_tasks if backlog_stats else 0
        }
    }

@router.get("/tasks/trends", response_model=schemas.TaskTrendsAnalytics)
async def get_task_trends(
    period: str = Query("month", enum=["week", "month", "quarter", "year"]),
    interval: str = Query("day", enum=["day", "week", "month"]),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get task creation and completion trends over time"""
    start_date = get_period_start_date(period)
    date_trunc = func.date_trunc(interval, models.Task.created_at)
    
    # Task creation trend
    creation_trend = db.query(
        date_trunc.label('date'),
        func.count(models.Task.id).label('count')
    ).filter(
        models.Task.department_id == current_user.department_id,
        models.Task.created_at >= start_date
    ).group_by(date_trunc).order_by(date_trunc).all()
    
    # Task completion trend
    completion_trend = db.query(
        func.date_trunc(interval, models.TaskAssignment.completed_at).label('date'),
        func.count(models.TaskAssignment.id).label('count')
    ).join(models.Task).filter(
        models.Task.department_id == current_user.department_id,
        models.TaskAssignment.completed_at >= start_date
    ).group_by('date').order_by('date').all()
    
    return {
        "period": period,
        "interval": interval,
        "creation_trend": [
            {"date": date, "count": count}
            for date, count in creation_trend
        ],
        "completion_trend": [
            {"date": date, "count": count}
            for date, count in completion_trend
        ]
    }

@router.get("/performance/metrics", response_model=schemas.PerformanceMetrics)
async def get_performance_metrics(
    user_id: Optional[int] = None,
    period: str = Query("month", enum=["week", "month", "quarter", "year"]),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get detailed performance metrics for a user or department"""
    start_date = get_period_start_date(period)
    
    query = db.query(models.TaskAssignment)
    if user_id:
        query = query.filter(models.TaskAssignment.assigned_to == user_id)
    else:
        query = query.join(models.Task).filter(
            models.Task.department_id == current_user.department_id
        )
    
    assignments = query.filter(
        models.TaskAssignment.created_at >= start_date
    ).all()
    
    # Calculate metrics
    total_tasks = len(assignments)
    completed_tasks = sum(1 for a in assignments if a.status == 'Completed')
    on_time_tasks = sum(1 for a in assignments 
                       if a.status == 'Completed' 
                       and a.completed_at 
                       and a.task.due_date 
                       and a.completed_at <= a.task.due_date)
    
    completion_times = [
        (a.completed_at - a.started_at).total_seconds()
        for a in assignments
        if a.completed_at and a.started_at
    ]
    
    # Add performance metrics from the dedicated table
    performance_record = db.query(models.PerformanceMetrics).filter(
        models.PerformanceMetrics.user_id == user_id if user_id else True,
        models.PerformanceMetrics.department_id == current_user.department_id,
        models.PerformanceMetrics.measured_at >= start_date
    ).order_by(models.PerformanceMetrics.measured_at.desc()).first()
    
    return {
        "period": period,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "completion_rate": (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0,
        "on_time_completion_rate": (on_time_tasks / completed_tasks * 100) if completed_tasks > 0 else 0,
        "avg_completion_time": timedelta(seconds=sum(completion_times) / len(completion_times)) if completion_times else None,
        "efficiency_score": calculate_efficiency_score(assignments),
        "efficiency_ratio": performance_record.efficiency_ratio if performance_record else None,
        "quality_rating": performance_record.quality_rating if performance_record else None,
        "avg_completion_time": performance_record.avg_completion_time if performance_record else None
    }

@router.get("/workload/distribution", response_model=schemas.WorkloadDistribution)
async def get_workload_distribution(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get current workload distribution across team members"""
    team_workload = db.query(
        models.User.id,
        models.User.display_name,
        func.count(models.TaskAssignment.id).label('active_tasks'),
        func.sum(case([(models.Task.priority == 'Critical', 3),
                      (models.Task.priority == 'High', 2),
                      (models.Task.priority == 'Medium', 1)], else_=0)).label('weighted_load')
    ).join(models.TaskAssignment).join(models.Task).filter(
        models.User.department_id == current_user.department_id,
        models.TaskAssignment.status.in_(['To Do', 'In Progress'])
    ).group_by(models.User.id, models.User.display_name).all()
    
    return {
        "workload_data": [
            {
                "user_id": user.id,
                "display_name": user.display_name,
                "active_tasks": metrics.active_tasks,
                "weighted_load": metrics.weighted_load,
                "workload_score": calculate_workload_score(metrics.active_tasks, metrics.weighted_load)
            }
            for user, metrics in team_workload
        ]
    }

def calculate_efficiency_score(assignments: List[models.TaskAssignment]) -> float:
    """Calculate efficiency score based on completion times and task priorities"""
    if not assignments:
        return 0
    
    priority_weights = {'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1}
    scores = []
    
    for assignment in assignments:
        if assignment.completed_at and assignment.started_at:
            actual_duration = (assignment.completed_at - assignment.started_at).total_seconds()
            estimated_duration = 432000  # 5 days in seconds (default estimation)
            priority_weight = priority_weights[assignment.task.priority]
            
            efficiency = min(estimated_duration / actual_duration if actual_duration > 0 else 1, 2)
            weighted_score = efficiency * priority_weight
            scores.append(weighted_score)
    
    return sum(scores) / len(scores) * 25 if scores else 0

def calculate_workload_score(active_tasks: int, weighted_load: int) -> float:
    """Calculate workload score based on number and weight of active tasks"""
    base_score = min(active_tasks * 10, 100)
    weight_factor = min(weighted_load / active_tasks if active_tasks > 0 else 0, 2)
    return base_score * weight_factor 