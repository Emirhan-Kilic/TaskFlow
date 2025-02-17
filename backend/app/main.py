from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from .routers import (
    user, tasks, departments, analytics, calendar, health,
    subdepartments, performance, task_assignments,
    task_dependencies, task_templates, task_attachments,
    notifications, reports, system_stats, comments,
    audit_logs, user_preferences, backlog_metrics,
    calendar_events, subdepartment_participations, department_stats,
    gemini
)

# --- Configuration ---
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# --- FastAPI Setup ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(health.router)
app.include_router(user.router)
app.include_router(tasks.router)
app.include_router(departments.router)
app.include_router(analytics.router)
app.include_router(calendar.router)
app.include_router(subdepartments.router)
app.include_router(performance.router)
app.include_router(task_assignments.router)
app.include_router(task_dependencies.router)
app.include_router(task_templates.router)
app.include_router(task_attachments.router)
app.include_router(notifications.router)
app.include_router(reports.router)
app.include_router(system_stats.router)
app.include_router(comments.router)
app.include_router(audit_logs.router)
app.include_router(user_preferences.router)
app.include_router(backlog_metrics.router)
app.include_router(calendar_events.router, prefix="/api")
app.include_router(subdepartment_participations.router)
app.include_router(department_stats.router)
app.include_router(gemini.router, prefix="/api")

