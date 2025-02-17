export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface TaskTemplate {
    id: number;
    name: string;
    description: string | null;
    default_priority: Priority;
    estimated_duration: string;
    department_id: number;
    created_by: number;
    created_at: string;
}

export interface TemplateFormData {
    name: string;
    description: string;
    default_priority: Priority;
    estimated_duration: string;
} 