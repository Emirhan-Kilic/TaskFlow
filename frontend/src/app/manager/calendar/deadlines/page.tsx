'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/app/supabaseClient';
import { toast } from 'react-hot-toast';

interface Task {
    id: bigint;
    title: string;
    description: string | null;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    due_date: string;
    start_date: string | null;
    version: number;
    task_assignments: {
        id: bigint;
        status: 'To Do' | 'In Progress' | 'Under Review' | 'Completed';
        progress: number;
        started_at: string | null;
        assigned_to: {
            id: bigint;
            display_name: string;
            profile_picture: string | null;
            job_title: string | null;
        };
    }[];
    task_attachments: {
        id: bigint;
        file_type: string;
        uploaded_at: string;
    }[];
    task_dependencies: {
        id: bigint;
        depends_on: bigint;
        dependency_type: string;
    }[];
}

interface User {
    id: bigint;
    department_id: bigint;
    role: string;
}

// Add this interface to handle the Supabase response type
interface TaskResponse {
    id: bigint;
    title: string;
    description: string | null;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    due_date: string;
    start_date: string | null;
    version: number;
    task_assignments: {
        id: bigint;
        status: 'To Do' | 'In Progress' | 'Under Review' | 'Completed';
        progress: number;
        started_at: string | null;
        assigned_to: {
            id: bigint;
            display_name: string;
            profile_picture: string | null;
            job_title: string | null;
        };
    }[];
    task_attachments: {
        id: bigint;
        file_type: string;
        uploaded_at: string;
    }[] | null;
    task_dependencies: {
        id: bigint;
        depends_on: bigint;
        dependency_type: string;
    }[] | null;
}

export default function UpcomingDeadlinesPage() {
    const router = useRouter();
    const [userData, setUserData] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [groupBy, setGroupBy] = useState<'priority' | 'date'>('date');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchUpcomingDeadlines = async () => {
            try {
                const { data: { session }, error: authError } = await supabase.auth.getSession();

                if (authError || !session) {
                    toast.error('Please login first');
                    router.push('/');
                    return;
                }

                const storedUserData = sessionStorage.getItem('userData');
                const userData: User | null = storedUserData ? JSON.parse(storedUserData) : null;

                if (!userData || userData.role !== 'manager') {
                    toast.error('Unauthorized access');
                    router.push('/');
                    return;
                }

                setUserData(userData);

                // Get upcoming deadlines using the backend API
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const endOfWeek = new Date();
                endOfWeek.setDate(today.getDate() + 7);
                endOfWeek.setHours(23, 59, 59, 999);

                const response = await fetch(`/api/tasks/upcoming?start_date=${today.toISOString()}&end_date=${endOfWeek.toISOString()}&department_id=${userData.department_id}`, {
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch tasks');
                }

                const tasks = await response.json();

                if (!tasks) {
                    setUpcomingTasks([]);
                    return;
                }

                // Transform the data to match the Task interface
                const transformedTasks = tasks.map((task: TaskResponse) => ({
                    ...task,
                    task_assignments: task.task_assignments.map((assignment: any) => ({
                        id: assignment.id,
                        status: assignment.status,
                        progress: assignment.progress,
                        started_at: assignment.started_at,
                        assigned_to: {
                            id: assignment.assigned_to.id,
                            display_name: assignment.assigned_to.display_name,
                            profile_picture: assignment.assigned_to.profile_picture,
                            job_title: assignment.assigned_to.job_title
                        }
                    })),
                    task_attachments: task.task_attachments || [],
                    task_dependencies: task.task_dependencies || []
                }));

                setUpcomingTasks(transformedTasks);

            } catch (error) {
                console.error('Error fetching upcoming deadlines:', error);
                toast.error('Failed to load upcoming deadlines');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUpcomingDeadlines();
    }, [router]);

    const filteredTasks = upcomingTasks
        .filter(task =>
            (filterPriority === 'all' || task.priority === filterPriority) &&
            (searchTerm === '' ||
                task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                task.description?.toLowerCase().includes(searchTerm.toLowerCase()))
        );

    const groupedTasks = groupBy === 'priority'
        ? groupTasksByPriority(filteredTasks)
        : groupTasksByDate(filteredTasks);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 relative overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10"></div>
                <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-float-slow"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float-slower"></div>
            </div>

            {/* Main content */}
            <div className="relative z-10">
                {/* Enhanced Header with Filters */}
                <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-between mb-4">
                            <h1 className="text-2xl font-light text-white">Upcoming Deadlines</h1>
                            <button
                                onClick={() => router.push('/manager/dashboard')}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors duration-300 flex items-center space-x-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                <span>Back</span>
                            </button>
                        </div>

                        {/* Filters and Search */}
                        <div className="flex flex-wrap gap-4 items-center">
                            <div className="flex-1 min-w-[200px]">
                                <input
                                    type="text"
                                    placeholder="Search tasks..."
                                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <select
                                className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                                value={filterPriority}
                                onChange={(e) => setFilterPriority(e.target.value)}
                            >
                                <option value="all">All Priorities</option>
                                <option value="Critical">Critical</option>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>

                            <select
                                className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value as 'priority' | 'date')}
                            >
                                <option value="date">Group by Date</option>
                                <option value="priority">Group by Priority</option>
                            </select>
                        </div>
                    </div>
                </header>

                {/* Enhanced Tasks List */}
                <main className="container mx-auto px-4 py-8">
                    <div className="space-y-6">
                        {Object.entries(groupedTasks).map(([group, tasks]) => (
                            <div key={group} className="space-y-4">
                                <h2 className="text-xl text-white font-medium">{group}</h2>
                                {tasks.map(task => (
                                    <div key={String(task.id)} className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 hover:border-blue-500/50 transition-colors duration-300">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-white font-medium">{task.title}</h3>
                                                {task.description && (
                                                    <p className="text-slate-400 mt-1">{task.description}</p>
                                                )}
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-sm ${task.priority === 'Critical' ? 'bg-red-500/20 text-red-400' :
                                                task.priority === 'High' ? 'bg-orange-500/20 text-orange-400' :
                                                    task.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {task.priority}
                                            </div>
                                        </div>

                                        {/* New Progress Section */}
                                        <div className="mt-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-slate-400 text-sm">Progress</span>
                                                <span className="text-slate-400 text-sm">
                                                    {calculateAverageProgress(task.task_assignments)}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-700 rounded-full h-2">
                                                <div
                                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                                    style={{ width: `${calculateAverageProgress(task.task_assignments)}%` }}
                                                ></div>
                                            </div>
                                        </div>

                                        {/* Enhanced Assignment Section */}
                                        <div className="mt-4 flex justify-between items-center">
                                            <div className="flex items-center space-x-4">
                                                <div className="flex -space-x-2">
                                                    {task.task_assignments.map(assignment => (
                                                        <div
                                                            key={String(assignment.id)}
                                                            className="relative group"
                                                        >
                                                            {assignment.assigned_to.profile_picture ? (
                                                                <img
                                                                    src={assignment.assigned_to.profile_picture}
                                                                    alt={assignment.assigned_to.display_name}
                                                                    className="w-8 h-8 rounded-full border-2 border-slate-800"
                                                                />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full border-2 border-slate-800 bg-slate-700 flex items-center justify-center text-white text-sm">
                                                                    {assignment.assigned_to.display_name.charAt(0)}
                                                                </div>
                                                            )}

                                                            {/* Enhanced Tooltip */}
                                                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block">
                                                                <div className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 whitespace-nowrap">
                                                                    <p>{assignment.assigned_to.display_name}</p>
                                                                    <p className="text-slate-400">{assignment.assigned_to.job_title}</p>
                                                                    <p className="text-slate-400">Status: {assignment.status}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Attachments Indicator */}
                                                {task.task_attachments.length > 0 && (
                                                    <div className="flex items-center text-slate-400">
                                                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                        </svg>
                                                        <span>{task.task_attachments.length}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Enhanced Due Date Display */}
                                            <div className="text-sm">
                                                <p className="text-slate-400">
                                                    Started: {task.start_date ? new Date(task.start_date).toLocaleDateString() : 'Not started'}
                                                </p>
                                                <p className={`${isNearDeadline(task.due_date) ? 'text-red-400' : 'text-slate-400'}`}>
                                                    Due: {new Date(task.due_date).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
}

// Helper functions
function calculateAverageProgress(assignments: Task['task_assignments']): number {
    if (assignments.length === 0) return 0;
    const total = assignments.reduce((sum, assignment) => sum + assignment.progress, 0);
    return Math.round(total / assignments.length);
}

function isNearDeadline(dueDate: string): boolean {
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 2 && diffDays >= 0;
}

function groupTasksByPriority(tasks: Task[]): Record<string, Task[]> {
    const priorityOrder = ['Critical', 'High', 'Medium', 'Low'];
    return priorityOrder.reduce((acc, priority) => {
        acc[priority] = tasks.filter(task => task.priority === priority);
        return acc;
    }, {} as Record<string, Task[]>);
}

function groupTasksByDate(tasks: Task[]): Record<string, Task[]> {
    return tasks.reduce((acc, task) => {
        const date = new Date(task.due_date).toLocaleDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(task);
        return acc;
    }, {} as Record<string, Task[]>);
}