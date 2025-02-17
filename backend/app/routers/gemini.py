from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import httpx
import os
from pydantic import BaseModel

router = APIRouter(
    prefix="/gemini",
    tags=["gemini"]
)

GEMINI_API_KEY = os.getenv("GOOGLE_GEMINI_API_KEY")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

class GeminiRequest(BaseModel):
    prompt: str
    temperature: float = 0.3
    topK: int = 80
    topP: float = 0.85
    maxOutputTokens: int = 8192

class DepartmentStats(BaseModel):
    name: str
    employeeCount: int
    taskStats: Dict[str, Any]
    performance: Dict[str, Any]
    backlog: Dict[str, Any]
    templates: list

class WorkloadContext(BaseModel):
    currentAssignments: Dict[str, Any]
    teamMembers: list
    workloadThresholds: Dict[str, float]

@router.post("/generate")
async def generate_content(request: GeminiRequest):
    """Generate content using Google's Gemini API."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GEMINI_BASE_URL}/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}",
                json={
                    "contents": [{
                        "parts": [{
                            "text": request.prompt
                        }]
                    }],
                    "generationConfig": {
                        "temperature": request.temperature,
                        "topK": request.topK,
                        "topP": request.topP,
                        "maxOutputTokens": request.maxOutputTokens
                    }
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Gemini API error: {response.text}"
                )

            return response.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calling Gemini API: {str(e)}")

@router.post("/task/description")
async def generate_task_description(title: str):
    """Generate a task description based on a title."""
    prompt = (f'Write a detailed task description for the following task title: "{title}". '
             'Include potential steps, considerations, and expected outcomes. '
             'Keep it professional and concise.')
    
    request = GeminiRequest(prompt=prompt)
    return await generate_content(request)

@router.post("/task/title")
async def generate_task_title(description: str):
    """Generate a task title based on a description."""
    prompt = (f'Create a concise, professional title (maximum 6 words) for a task with the following description: "{description}". '
             'The title should be clear, action-oriented, and reflect the main objective. '
             'Return only the title text without quotes or additional explanation.')
    
    request = GeminiRequest(prompt=prompt)
    return await generate_content(request)

@router.post("/task/decompose")
async def decompose_task(description: str):
    """Decompose a task into its fundamental components."""
    prompt = (f'Analyze and decompose the following task into its fundamental components: "{description}"\n'
             'Please provide:\n'
             '1. Core objectives\n'
             '2. Required steps (as a numbered list)\n'
             '3. Dependencies and prerequisites\n'
             '4. Estimated complexity (Low/Medium/High)\n'
             '5. Suggested team size\n'
             '6. Potential challenges\n\n'
             'Format the response in a clear, structured way.')
    
    request = GeminiRequest(prompt=prompt)
    return await generate_content(request)

@router.post("/department/report")
async def generate_department_report(stats: DepartmentStats):
    """Generate a comprehensive department performance analysis report."""
    
    # Calculate additional metrics
    overdueRate = (stats.taskStats["overdue"] / stats.taskStats["total"]) * 100
    criticalTaskRate = (stats.taskStats["byPriority"]["Critical"] / stats.taskStats["total"]) * 100
    completionRate = (stats.taskStats["completed"] / stats.taskStats["total"]) * 100
    avgTasksPerEmployee = stats.taskStats["total"] / stats.employeeCount

    prompt = f"""Generate a comprehensive department performance analysis report using the following concrete data. 
Do not use any markdown formatting or asterisks. Format the report with clear headings and proper spacing.

CURRENT DEPARTMENT METRICS:
Department: {stats.name}
Total Employees: {stats.employeeCount}
Total Tasks: {stats.taskStats["total"]}

Key Performance Indicators:
1. Task Completion Rate: {completionRate:.1f}%
2. Overdue Rate: {overdueRate:.1f}%
3. Critical Task Rate: {criticalTaskRate:.1f}%
4. Average Tasks per Employee: {avgTasksPerEmployee:.1f}
5. Department Efficiency Score: {stats.performance["avgEfficiencyRatio"]:.1f}%
6. Quality Rating: {stats.performance["avgQualityRating"]:.1f}/100

[... rest of the detailed prompt from frontend/src/app/manager/analytics/reports/page.tsx ...]"""

    request = GeminiRequest(
        prompt=prompt,
        temperature=0.3,
        maxOutputTokens=8192
    )
    return await generate_content(request)

@router.post("/workload/optimize")
async def optimize_workload(context: WorkloadContext):
    """Generate workload optimization suggestions."""
    
    prompt = f"""You are a workload optimization expert. Analyze the following team workload data and current task assignments to suggest the most rational redistribution of EXISTING tasks only.

Team Data:
{context.currentAssignments}

Important Optimization Rules:
1. Focus on MEANINGFUL redistributions:
   - Moving a single task from someone with only one task to someone with no tasks 
     is NOT meaningful optimization
   - Prioritize redistributing tasks from overloaded team members who have multiple tasks
   - Look for opportunities to balance workload across the team more effectively
   - Consider the overall impact on team efficiency

Optimization Criteria (in order of priority):
1. Workload Balance:
   - Optimal workload is {context.workloadThresholds["OPTIMAL"]}%
   - Critical threshold is {context.workloadThresholds["CRITICAL"]}%
   - High threshold is {context.workloadThresholds["HIGH"]}%

[... additional optimization criteria from frontend code ...]"""

    request = GeminiRequest(
        prompt=prompt,
        temperature=0.3,
        maxOutputTokens=8192
    )
    return await generate_content(request) 