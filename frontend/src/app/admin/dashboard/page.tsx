'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';
import { Dialog } from '@headlessui/react';
import { Tab } from '@headlessui/react';
import { UserManagement } from '@/components/admin/UserManagement';
import { DepartmentManagement } from '@/components/admin/DepartmentManagement';
import { TaskManagement } from '@/components/admin/TaskManagement';
import { formatFileSize, formatDate } from '@/utils/formatters';
import { SystemStats } from '@/components/admin/SystemStats';
import { LoadingSpinner } from '@/components/admin/LoadingSpinner';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { User, Department, Task } from '@/types/database';
import { TemplateManagement } from '@/components/admin/TemplateManagement';
import { CalendarEventManagement } from '@/components/admin/CalendarEventManagement';
import { TaskAttachmentManagement } from '@/components/admin/TaskAttachmentManagement';
import { SubdepartmentManagement } from '@/components/admin/SubdepartmentManagement';

interface TaskTemplate {
    id: bigint;
    name: string;
    description: string | null;
    default_priority: 'Low' | 'Medium' | 'High' | 'Critical';
    estimated_duration: string | null;
    department_id: bigint;
    created_by: bigint;
    created_at: string;
}

interface TaskAssignment {
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

interface Subdepartment {
    id: bigint;
    department_id: bigint;
    name: string;
    description: string | null;
    manager_id: bigint | null;
    employee_count: number;
    created_at: string;
    updated_at: string;
}

interface PerformanceMetric {
    id: number;
    user_id: number;
    department_id: number;
    tasks_completed: number;
    avg_completion_time: string;
    efficiency_ratio: number;
    quality_rating: number;
    measured_at: string;
}

interface BacklogMetric {
    id: number;
    department_id: number;
    overdue_tasks: number;
    high_priority_tasks: number;
    avg_delay: string;
    measured_at: string;
}

interface TaskDependency {
    id: bigint;
    task_id: bigint;
    depends_on: bigint;
    dependency_type: string;
    created_at: string;
}

interface TaskAttachment {
    id: bigint;
    task_id: bigint;
    file_name: string;
    file_url: string;
    file_type: string;
    file_size: number;
    thumbnail_path: string | null;
    uploaded_by: bigint;
    uploaded_at: string;
    created_at: string;
    updated_at: string;
}

interface Notification {
    id: bigint;
    user_id: bigint;
    task_id: bigint | null;
    type: 'email' | 'sms' | 'push';
    subject: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

interface CalendarEvent {
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

interface SubdepartmentParticipation {
    id: bigint;
    subdepartment_id: bigint;
    user_id: bigint;
    role: string;
    joined_at: string;
}

export default function AdminDashboard() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [userData, setUserData] = useState<any>(null);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
    const [subdepartments, setSubdepartments] = useState<Subdepartment[]>([]);
    const [participations, setParticipations] = useState<SubdepartmentParticipation[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [templates, setTemplates] = useState<TaskTemplate[]>([]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/system-stats/admin-dashboard');
            if (!response.ok) throw new Error('Failed to fetch dashboard data');

            const data = await response.json();

            setUsers(data.users);
            setDepartments(data.departments);
            setTasks(data.tasks);
            setTemplates(data.templates);
            setEvents(data.events);
            setAttachments(data.attachments);
            setSubdepartments(data.subdepartments);
            setParticipations(data.participations);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to load data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error || !session) {
                    toast.error('Please login first');
                    router.push('/');
                    return;
                }

                const userData = JSON.parse(sessionStorage.getItem('userData') || 'null');

                if (userData?.role?.toLowerCase() !== 'admin') {
                    toast.error('Unauthorized access');
                    router.push('/');
                    return;
                }

                setUserData(userData);
            } catch (error) {
                console.error('Auth error:', error);
                toast.error('Authentication error');
                router.push('/');
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, [router]);

    const handleUserEdit = async (user: User) => {
        try {
            const response = await fetch(`/api/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });

            if (!response.ok) throw new Error('Failed to update user');
            toast.success('User updated successfully');
            fetchData();
        } catch (error) {
            console.error('Error updating user:', error);
            toast.error('Failed to update user');
        }
    };

    const handleCreateUser = async (user: Omit<User, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });

            if (!response.ok) throw new Error('Failed to create user');
            toast.success('User created successfully');
            fetchData();
        } catch (error) {
            console.error('Error creating user:', error);
            toast.error('Failed to create user');
        }
    };

    const handleDepartmentEdit = async (department: Department) => {
        try {
            const response = await fetch(`/api/departments/${department.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(department)
            });

            if (!response.ok) throw new Error('Failed to update department');
            toast.success('Department updated successfully');
            fetchData();
        } catch (error) {
            console.error('Error updating department:', error);
            toast.error('Failed to update department');
        }
    };

    const handleCreateDepartment = async (department: Omit<Department, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            const response = await fetch('/api/departments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(department)
            });

            if (!response.ok) throw new Error('Failed to create department');
            toast.success('Department created successfully');
            fetchData();
        } catch (error) {
            console.error('Error creating department:', error);
            toast.error('Failed to create department');
        }
    };

    const handleTaskEdit = async (task: Task) => {
        try {
            const response = await fetch(`/api/tasks/${task.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task)
            });

            if (!response.ok) throw new Error('Failed to update task');
            toast.success('Task updated successfully');
            fetchData();
        } catch (error) {
            console.error('Error updating task:', error);
            toast.error('Failed to update task');
        }
    };

    const handleCreateTask = async (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task)
            });

            if (!response.ok) throw new Error('Failed to create task');
            toast.success('Task created successfully');
            fetchData();
        } catch (error) {
            console.error('Error creating task:', error);
            toast.error('Failed to create task');
        }
    };

    const handleTemplateEdit = async (template: TaskTemplate) => {
        try {
            const response = await fetch(`/api/task-templates/${template.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(template)
            });

            if (!response.ok) throw new Error('Failed to update template');
            toast.success('Template updated successfully');
            fetchData();
        } catch (error) {
            console.error('Error updating template:', error);
            toast.error('Failed to update template');
        }
    };

    const handleCreateTemplate = async (template: Omit<TaskTemplate, 'id' | 'created_at'>) => {
        try {
            const response = await fetch('/api/task-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(template)
            });

            if (!response.ok) throw new Error('Failed to create template');
            toast.success('Template created successfully');
            fetchData();
        } catch (error) {
            console.error('Error creating template:', error);
            toast.error('Failed to create template');
        }
    };

    const handleCalendarEventEdit = async (event: CalendarEvent) => {
        try {
            const response = await fetch(`/api/calendar-events/${event.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });

            if (!response.ok) throw new Error('Failed to update calendar event');
            toast.success('Calendar event updated successfully');
            fetchData();
        } catch (error) {
            console.error('Error updating calendar event:', error);
            toast.error('Failed to update calendar event');
        }
    };

    const handleCalendarEventDelete = async (eventId: bigint) => {
        try {
            const response = await fetch(`/api/calendar-events/${eventId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete calendar event');
            toast.success('Calendar event deleted successfully');
            fetchData();
        } catch (error) {
            console.error('Error deleting calendar event:', error);
            toast.error('Failed to delete calendar event');
        }
    };

    const handleCreateCalendarEvent = async (event: Omit<CalendarEvent, 'id' | 'created_at'>) => {
        try {
            const response = await fetch('/api/calendar-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });

            if (!response.ok) throw new Error('Failed to create calendar event');
            toast.success('Calendar event created successfully');
            fetchData();
        } catch (error) {
            console.error('Error creating calendar event:', error);
            toast.error('Failed to create calendar event');
        }
    };

    const handleSubdepartmentEdit = async (subdepartment: Subdepartment) => {
        try {
            const { error } = await supabase
                .from('subdepartments')
                .update({
                    ...subdepartment,
                    updated_at: new Date().toISOString()
                })
                .eq('id', subdepartment.id);

            if (error) throw error;
            toast.success('Subdepartment updated successfully');
            fetchData();
        } catch (error) {
            console.error('Error updating subdepartment:', error);
            toast.error('Failed to update subdepartment');
        }
    };

    const handleCreateSubdepartment = async (subdepartment: Omit<Subdepartment, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            const now = new Date().toISOString();
            const { error } = await supabase
                .from('subdepartments')
                .insert([{
                    ...subdepartment,
                    created_at: now,
                    updated_at: now
                }]);

            if (error) throw error;
            toast.success('Subdepartment created successfully');
            fetchData();
        } catch (error) {
            console.error('Error creating subdepartment:', error);
            toast.error('Failed to create subdepartment');
        }
    };

    const handleAddSubdepartmentMember = async (participation: Omit<SubdepartmentParticipation, 'id' | 'joined_at'>) => {
        try {
            const { error } = await supabase
                .from('subdepartment_participations')
                .insert([{
                    ...participation,
                    joined_at: new Date().toISOString()
                }]);

            if (error) throw error;
            toast.success('Member added successfully');
            fetchData();
        } catch (error) {
            console.error('Error adding member:', error);
            toast.error('Failed to add member');
        }
    };

    const handleAttachmentDelete = async (attachmentId: bigint) => {
        try {
            // First delete from storage (keep using supabase.storage)
            const attachmentToRemove = attachments.find(att => att.id === attachmentId);
            if (attachmentToRemove) {
                const { error: storageError } = await supabase.storage
                    .from('task-attachments')
                    .remove([attachmentToRemove.file_path]);

                if (storageError) throw storageError;
            }

            // Then delete from database using backend API
            const response = await fetch(`/api/attachments/${attachmentId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete attachment');
            toast.success('Attachment deleted successfully');
            fetchData();
        } catch (error) {
            console.error('Error deleting attachment:', error);
            toast.error('Failed to delete attachment');
        }
    };

    const handleAttachmentUpload = async (attachment: Omit<TaskAttachment, 'id' | 'uploaded_at' | 'created_at' | 'updated_at'>) => {
        try {
            const now = new Date().toISOString();

            const { error } = await supabase
                .from('task_attachments')
                .insert([{
                    ...attachment,
                    uploaded_at: now,
                    created_at: now,
                    updated_at: now
                }]);

            if (error) throw error;
            toast.success('Attachment uploaded successfully');
            fetchData();
        } catch (error) {
            console.error('Error uploading attachment:', error);
            toast.error('Failed to upload attachment');
        }
    };

    if (isLoading) {
        return <LoadingSpinner />;
    }

    return (
        <AdminLayout userData={userData}>
            <div className="container mx-auto px-4 py-8">
                <SystemStats />

                <div className="space-y-8">
                    <UserManagement
                        users={users}
                        departments={departments}
                        onEdit={handleUserEdit}
                        onCreate={handleCreateUser}
                    />

                    <DepartmentManagement
                        departments={departments}
                        users={users}
                        onEdit={handleDepartmentEdit}
                        onCreate={handleCreateDepartment}
                    />

                    <TaskManagement
                        tasks={tasks}
                        departments={departments}
                        users={users}
                        onEdit={handleTaskEdit}
                        onCreate={handleCreateTask}
                    />

                    <TemplateManagement
                        templates={templates}
                        departments={departments}
                        users={users}
                        onEdit={handleTemplateEdit}
                        onCreate={handleCreateTemplate}
                    />

                    <CalendarEventManagement
                        events={events}
                        users={users}
                        tasks={tasks}
                        onEdit={handleCalendarEventEdit}
                        onDelete={handleCalendarEventDelete}
                        onCreate={handleCreateCalendarEvent}
                    />

                    <TaskAttachmentManagement
                        attachments={attachments}
                        tasks={tasks}
                        users={users}
                        onDelete={handleAttachmentDelete}
                        onUpload={handleAttachmentUpload}
                    />

                    <SubdepartmentManagement
                        subdepartments={subdepartments}
                        departments={departments}
                        users={users}
                        participations={participations}
                        onEdit={handleSubdepartmentEdit}
                        onCreate={handleCreateSubdepartment}
                        onAddMember={handleAddSubdepartmentMember}
                    />
                </div>
            </div>
        </AdminLayout>
    );
}
