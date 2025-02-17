export interface TaskAttachment {
    id: bigint;
    task_id: bigint;
    file_name: string;
    file_url: string;
    file_type: string;
    file_size: number;
    created_at: string;
    updated_at: string;
}

export interface Task {
    id: bigint;
    // ... other existing fields ...
    attachments: TaskAttachment[];
}

export interface User {
    id: bigint;
    email: string;
    role: 'admin' | 'manager' | 'personnel';
    department_id: bigint | null;
    profile_picture: string | null;
    display_name: string | null;
    job_title: string | null;
    last_login: string | null;
    created_at: string;
    updated_at: string;
    auth_uid: string;
}

export interface Department {
    id: bigint;
    name: string;
    manager_id: bigint | null;
    employee_count: number;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export interface TaskTemplate {
    id: bigint;
    name: string;
    description: string | null;
    default_priority: 'Low' | 'Medium' | 'High' | 'Critical';
    estimated_duration: string | null;
    department_id: bigint;
    created_by: bigint;
    created_at: string;
}

export interface TaskAssignment {
    id: bigint;
    task_id: bigint;
    assigned_to: bigint;
    status: 'To Do' | 'In Progress' | 'Under Review' | 'Completed';
    progress: number;
    comments: string | null;
    started_at: string | null;
    completed_at: string | null;
    version: number;
    created_at: string;
    updated_at: string;
}

export interface TaskDependency {
    id: bigint;
    task_id: bigint;
    depends_on: bigint;
    dependency_type: string;
    created_at: string;
}

export interface Notification {
    id: bigint;
    user_id: bigint;
    task_id: bigint | null;
    type: 'email' | 'sms' | 'push';
    subject: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

export interface CalendarEvent {
    id: bigint;
    task_id: bigint;
    user_id: bigint;
    external_id: string;
    start_time: string;
    end_time: string;
    service_type: string;
    sync_token: string | null;
    last_synced: string | null;
    created_at: string;
}

export interface Subdepartment {
    id: bigint;
    department_id: bigint;
    name: string;
    description: string | null;
    manager_id: bigint | null;
    employee_count: number;
    created_at: string;
    updated_at: string;
}

export interface SubdepartmentParticipation {
    id: bigint;
    subdepartment_id: bigint;
    user_id: bigint;
    role: string;
    joined_at: string;
}

export interface PerformanceMetric {
    id: bigint;
    user_id: bigint;
    department_id: bigint;
    tasks_completed: number;
    avg_completion_time: string;
    efficiency_ratio: number;
    quality_rating: number;
    measured_at: string;
}

export interface BacklogMetric {
    id: bigint;
    department_id: bigint;
    overdue_tasks: number;
    high_priority_tasks: number;
    avg_delay: string;
    measured_at: string;
} 