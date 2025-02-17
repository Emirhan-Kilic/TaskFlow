export interface TaskTemplate {
    id: number;
    name: string;
    description: string | null;
    default_priority: 'Low' | 'Medium' | 'High' | 'Critical';
    estimated_duration: string | null;
    department_id: number;
    created_by: number;
    created_at: string;
}

export interface TaskFormData {
    title: string;
    description: string;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    start_date: string;
    due_date: string;
    assigned_to: number[];
    dependencies: Array<{
        depends_on: number;
        dependency_type: string;
    }>;
}

export interface Task {
    id: number;
    title: string;
    description: string | null;
    department_id: number;
    created_by: number;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    due_date: string | null;
    start_date: string | null;
    template_id: number | null;
    version: number;
    created_at: string;
    updated_at: string;
}

export interface User {
    id: number;
    email: string;
    role: 'admin' | 'manager' | 'personnel';
    department_id: number | null;
    profile_picture: string | null;
    display_name: string | null;
    job_title: string | null;
    last_login: string | null;
    created_at: string;
    updated_at: string;
    auth_uid: string;
}

export interface TaskAssignment {
    task_id: number;
    assigned_to: number;
    status: 'To Do' | 'In Progress' | 'Under Review' | 'Completed';
    created_at: string;
    start_date: string | null;
}

export interface TaskAttachment {
    id: number;
    task_id: number;
    file_path: string;
    file_type: string;
    file_size: number;
    uploaded_by: number;
    created_at: string;
}

export interface TaskDependency {
    task_id: number;
    depends_on: number;
    dependency_type: string;
    created_at: string;
} 