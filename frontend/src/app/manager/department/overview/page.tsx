'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/app/supabaseClient';
import { toast } from 'react-hot-toast';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    ComposedChart,
    Line,
    AreaChart,
    Area,
    ScatterChart,
    Scatter,
    ReferenceLine,
    ReferenceArea,
    Label
} from 'recharts';

// Database enum types
type priority_enum = 'Critical' | 'High' | 'Medium' | 'Low';
type task_status_enum = 'To Do' | 'In Progress' | 'Under Review' | 'Completed';
type role_enum = 'admin' | 'manager' | 'personnel';

// Database table interfaces
interface TaskAssignment {
    id: number;
    task_id: number;
    assigned_to: number;
    status: task_status_enum;
    progress: number;
    comments: string | null;
    started_at: string | null;
    completed_at: string | null;
    version: number;
    created_at: string;
    updated_at: string;
}

interface Task {
    id: number;
    title: string;
    description: string | null;
    department_id: number;
    created_by: number;
    priority: priority_enum;
    due_date: string;
    start_date: string | null;
    version: number;
    template_id: number | null;
    created_at: string;
    updated_at: string;
    task_assignments: TaskAssignment[];
    task_dependencies: TaskDependency[];
    task_attachments: TaskAttachment[];
}

interface TaskDependency {
    id: number;
    task_id: number;
    depends_on: number;
    dependency_type: string;
    created_at: string;
}

interface TaskAttachment {
    id: number;
    task_id: number;
    file_path: string;
    file_type: string;
    file_size: number;
    thumbnail_path: string | null;
    uploaded_by: number;
    uploaded_at: string;
}

interface PerformanceMetric {
    id: number;
    user_id: number;
    department_id: number;
    tasks_completed: number;
    avg_completion_time: string; // INTERVAL in PostgreSQL
    efficiency_ratio: number;
    quality_rating: number;
    measured_at: string;
}

interface BacklogMetric {
    id: number;
    department_id: number;
    overdue_tasks: number;
    high_priority_tasks: number;
    avg_delay: string; // INTERVAL in PostgreSQL
    measured_at: string;
}

interface TaskTemplate {
    id: number;
    name: string;
    description: string | null;
    default_priority: priority_enum;
    estimated_duration: string; // INTERVAL in PostgreSQL
    department_id: number;
    created_by: number;
    created_at: string;
}

// Component state interfaces
interface DepartmentStats {
    id: number;
    name: string;
    description: string | null;
    employeeCount: number;
    taskStats: {
        total: number;
        completed: number;
        inProgress: number;
        overdue: number;
        upcoming: number;
        byPriority: Record<priority_enum, number>;
        byStatus: Record<task_status_enum, number>;
        overdueByPriority: Array<{
            name: priority_enum;
            value: number;
            days: number;
        }>;
        completionTrend: Array<{
            date: string;
            completed: number;
        }>;
        averageCompletionTime: number;
        lateDays: Array<{
            name: string;
            value: number;
        }>;
    };
    performance: {
        avgCompletionTime: number;
        avgEfficiencyRatio: number;
        avgQualityRating: number;
        taskCompletionRate: number;
    };
    backlog: {
        overdueTasks: number;
        highPriorityTasks: number;
        avgDelay: number;
    };
    trends: {
        daily: Array<{
            date: string;
            completed: number;
            new: number;
        }>;
        efficiency: Array<{
            date: string;
            value: number;
        }>;
        quality: Array<{
            date: string;
            value: number;
        }>;
    };
    templates: Array<{
        name: string;
        usage: number;
        avgDuration: number;
    }>;
}

interface User {
    id: number;
    department_id: number;
    role: role_enum;
}

interface WorkloadData {
    userId: bigint;
    userName: string;
    profilePicture: string | null;
    jobTitle: string | null;
    taskCount: number;
    criticalTasks: number;
    highPriorityTasks: number;
    mediumPriorityTasks: number;
    lowPriorityTasks: number;
    averageProgress: number;
    overdueTasks: number;
    upcomingDeadlines: number;
    totalEstimatedHours: number;
    tasksByStatus: {
        [key: string]: number;
    };
    workloadScore: number;
    efficiencyRate: number;
    taskCompletionRate: number;
    workloadTrend: number[];
    riskScore: number;
}

interface AssignmentResponse {
    id: number;
    status: 'To Do' | 'In Progress' | 'Under Review' | 'Completed';
    progress: number;
    started_at: string | null;
    assigned_to: {
        id: number;
        display_name: string;
        profile_picture: string | null;
        job_title: string | null;
    };
    task: {
        id: number;
        priority: 'Low' | 'Medium' | 'High' | 'Critical';
        due_date: string;
        start_date: string | null;
    };
}

const PRIORITY_COLORS = {
    Critical: '#ef4444',
    High: '#f97316',
    Medium: '#eab308',
    Low: '#3b82f6'
};

const STATUS_COLORS = {
    'To Do': '#94a3b8',
    'In Progress': '#3b82f6',
    'Under Review': '#a855f7',
    'Completed': '#22c55e'
};

const WORKLOAD_THRESHOLDS = {
    OPTIMAL: 70,
    HIGH: 85,
    CRITICAL: 95
};

const RISK_COLORS = {
    Low: '#22c55e',
    Medium: '#eab308',
    High: '#f97316',
    Critical: '#ef4444'
};

// First, let's define consistent risk thresholds
const RISK_THRESHOLDS = {
    CRITICAL: 75,
    HIGH: 50,
    MEDIUM: 25,
    LOW: 0
} as const;

const COLORS = {
    primary: '#3b82f6',
    success: '#22c55e',
    warning: '#eab308',
    danger: '#ef4444',
    purple: '#a855f7',
    orange: '#f97316',
    slate: '#94a3b8'
};

export default function DepartmentOverviewPage() {
    const router = useRouter();
    const [userData, setUserData] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [departmentStats, setDepartmentStats] = useState<DepartmentStats | null>(null);
    const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('week');

    useEffect(() => {
        const fetchDepartmentStats = async () => {
            try {
                // Auth check
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

                // Fetch department stats from backend
                const response = await fetch(`/api/departments/${userData.department_id}/stats?time_range=${timeRange}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch department stats');
                }

                const stats = await response.json();
                setDepartmentStats(stats);

            } catch (error) {
                console.error('Error fetching department statistics:', error);
                toast.error('Failed to load department overview');
            } finally {
                setIsLoading(false);
            }
        };

        fetchDepartmentStats();
    }, [router, timeRange]);

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
                {/* Header */}
                <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-between mb-4">
                            <h1 className="text-2xl font-light text-white">Team Workload Distribution</h1>
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

                        {/* Controls */}
                        <div className="flex flex-wrap gap-4 items-center">
                            <select
                                className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                                value={timeRange}
                                onChange={(e) => setTimeRange(e.target.value as any)}
                            >
                                <option value="week">Next Week</option>
                                <option value="month">Next Month</option>
                                <option value="quarter">Next Quarter</option>
                            </select>
                        </div>
                    </div>
                </header>

                {/* Charts and Statistics */}
                <main className="container mx-auto px-4 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Overdue Tasks by Priority */}
                        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-white text-lg mb-4">Overdue Tasks by Priority</h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={departmentStats?.taskStats.overdueByPriority}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                        <XAxis dataKey="name" stroke="#94a3b8" />
                                        <YAxis yAxisId="left" stroke="#94a3b8" />
                                        <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1e293b',
                                                border: '1px solid #475569'
                                            }}
                                        />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="value" name="Tasks" fill="#ef4444" />
                                        <Bar yAxisId="right" dataKey="days" name="Avg Days Late" fill="#f97316" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Task Completion Trend */}
                        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-white text-lg mb-4">Task Completion Trend</h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={departmentStats?.taskStats.completionTrend}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                        <XAxis dataKey="date" stroke="#94a3b8" />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1e293b',
                                                border: '1px solid #475569'
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="completed"
                                            stroke="#22c55e"
                                            fill="#22c55e"
                                            fillOpacity={0.2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Late Days Distribution */}
                        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-white text-lg mb-4">Late Days Distribution</h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={departmentStats?.taskStats.lateDays.slice(0, 10)}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                        <XAxis dataKey="name" stroke="#94a3b8" />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1e293b',
                                                border: '1px solid #475569'
                                            }}
                                        />
                                        <Bar dataKey="value" name="Days Late" fill="#f97316">
                                            {departmentStats?.taskStats.lateDays.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={
                                                        entry.value > 14 ? '#ef4444' :
                                                            entry.value > 7 ? '#f97316' :
                                                                entry.value > 3 ? '#eab308' :
                                                                    '#22c55e'
                                                    }
                                                />
                                            ))}
                                        </Bar>
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#94a3b8"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Department Performance Metrics */}
                        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-white text-lg mb-4">Department Performance</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-700/50 rounded-lg p-4">
                                    <p className="text-slate-400 text-sm">Average Completion Time</p>
                                    <p className="text-white text-2xl font-semibold">
                                        {Math.round(departmentStats?.taskStats.averageCompletionTime || 0)} days
                                    </p>
                                </div>
                                <div className="bg-slate-700/50 rounded-lg p-4">
                                    <p className="text-slate-400 text-sm">Overdue Tasks</p>
                                    <p className="text-red-400 text-2xl font-semibold">
                                        {departmentStats?.taskStats.overdue || 0}
                                    </p>
                                </div>
                                <div className="bg-slate-700/50 rounded-lg p-4">
                                    <p className="text-slate-400 text-sm">Completion Rate</p>
                                    <p className="text-green-400 text-2xl font-semibold">
                                        {departmentStats?.taskStats.total ?
                                            Math.round((departmentStats.taskStats.completed / departmentStats.taskStats.total) * 100) : 0}%
                                    </p>
                                </div>
                                <div className="bg-slate-700/50 rounded-lg p-4">
                                    <p className="text-slate-400 text-sm">Active Tasks</p>
                                    <p className="text-blue-400 text-2xl font-semibold">
                                        {departmentStats?.taskStats.inProgress || 0}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

function calculateWorkloadScore(userData: WorkloadData): number {
    const priorityWeights = {
        Critical: 4,
        High: 3,
        Medium: 2,
        Low: 1
    };

    const baseScore = (
        (userData.criticalTasks * priorityWeights.Critical) +
        (userData.highPriorityTasks * priorityWeights.High) +
        (userData.mediumPriorityTasks * priorityWeights.Medium) +
        (userData.lowPriorityTasks * priorityWeights.Low)
    ) / userData.taskCount;

    const overduePenalty = (userData.overdueTasks / userData.taskCount) * 25;
    const progressBonus = (userData.averageProgress / 100) * 15;

    return Math.min(100, Math.max(0, (baseScore * 20) + overduePenalty - progressBonus));
}

function calculateRiskScore(userData: WorkloadData): number {
    if (userData.taskCount === 0) return 0;

    const overdueFactor = (userData.overdueTasks / userData.taskCount) * 100;
    const criticalFactor = (userData.criticalTasks / userData.taskCount) * 100;
    const workloadFactor = userData.workloadScore;
    const progressFactor = 100 - userData.averageProgress;

    // Weighted risk calculation
    const riskScore = (
        (overdueFactor * 0.35) +     // 35% weight for overdue tasks
        (criticalFactor * 0.25) +    // 25% weight for critical tasks
        (workloadFactor * 0.25) +    // 25% weight for overall workload
        (progressFactor * 0.15)      // 15% weight for lack of progress
    );

    return Math.min(100, Math.max(0, riskScore));
}

function getRiskLevel(riskScore: number): 'Critical' | 'High' | 'Medium' | 'Low' {
    if (riskScore >= RISK_THRESHOLDS.CRITICAL) return 'Critical';
    if (riskScore >= RISK_THRESHOLDS.HIGH) return 'High';
    if (riskScore >= RISK_THRESHOLDS.MEDIUM) return 'Medium';
    return 'Low';
}

function calculateEfficiencyRate(assignment: AssignmentResponse): number {
    // Base efficiency starts at 70%
    let efficiency = 70;

    // Add efficiency based on progress vs time elapsed
    if (assignment.started_at) {
        const startDate = new Date(assignment.started_at);
        const dueDate = new Date(assignment.task.due_date);
        const now = new Date();

        const totalDuration = dueDate.getTime() - startDate.getTime();
        const timeElapsed = now.getTime() - startDate.getTime();
        const expectedProgress = (timeElapsed / totalDuration) * 100;

        // Bonus for being ahead of schedule, penalty for being behind
        efficiency += (assignment.progress - expectedProgress) * 0.5;
    }

    // Penalty for overdue tasks
    if (new Date(assignment.task.due_date) < new Date() && assignment.status !== 'Completed') {
        efficiency -= 20;
    }

    // Bonus for completed tasks
    if (assignment.status === 'Completed') {
        efficiency += 15;
    }

    // Ensure efficiency stays within 0-100 range
    return Math.min(100, Math.max(0, efficiency));
}

function calculateCompletionRate(assignment: AssignmentResponse): number {
    const statusWeights = {
        'To Do': 0,
        'In Progress': 0.3,
        'Under Review': 0.8,
        'Completed': 1
    };

    return statusWeights[assignment.status] * 100;
}

function generateWorkloadTrend(assignment: AssignmentResponse): number[] {
    // Generate a simplified 7-point trend
    const trend: number[] = [];
    const baseLoad = 50; // Base workload

    // Generate 7 data points with some variation
    for (let i = 0; i < 7; i++) {
        let load = baseLoad;

        // Add weight based on priority
        switch (assignment.task.priority) {
            case 'Critical':
                load += 30;
                break;
            case 'High':
                load += 20;
                break;
            case 'Medium':
                load += 10;
                break;
            default:
                break;
        }

        // Add some random variation (-5 to +5)
        load += Math.floor(Math.random() * 11) - 5;

        // Ensure the value stays within 0-100
        trend.push(Math.min(100, Math.max(0, load)));
    }

    return trend;
}

function calculateUserWorkload(assignments: AssignmentResponse[]): number[] {
    const trend: number[] = new Array(7).fill(0);

    assignments.forEach(assignment => {
        const loadImpact = generateWorkloadTrend(assignment);
        trend.forEach((value, index) => {
            trend[index] = Math.min(100, value + (loadImpact[index] / assignments.length));
        });
    });

    return trend;
}

function getRiskDescription(riskScore: number): string {
    const level = getRiskLevel(riskScore);
    switch (level) {
        case 'Critical':
            return 'Immediate attention required';
        case 'High':
            return 'Needs close monitoring';
        case 'Medium':
            return 'Monitor regularly';
        case 'Low':
            return 'Within acceptable limits';
    }
}

function processTaskStats(tasks: any[]): DepartmentStats['taskStats'] {
    const stats = {
        total: tasks.length,
        completed: 0,
        inProgress: 0,
        overdue: 0,
        upcoming: 0,
        byPriority: {
            Critical: 0,
            High: 0,
            Medium: 0,
            Low: 0
        },
        byStatus: {
            'To Do': 0,
            'In Progress': 0,
            'Under Review': 0,
            'Completed': 0
        },
        overdueByPriority: [] as { name: string; value: number; days: number }[],
        completionTrend: [] as { date: string; completed: number }[],
        averageCompletionTime: 0,
        lateDays: [] as { name: string; value: number }[]
    };

    const now = new Date();
    let totalCompletionDays = 0;
    let completedTasks = 0;

    tasks.forEach(task => {
        // Count by priority
        stats.byPriority[task.priority as keyof typeof stats.byPriority]++;

        // Count by status
        const status = task.task_assignments[0]?.status || 'To Do';
        stats.byStatus[status as keyof typeof stats.byStatus] =
            (stats.byStatus[status as keyof typeof stats.byStatus] || 0) + 1;

        // Also update other counters
        if (status === 'Completed') {
            stats.completed++;
        } else if (status === 'In Progress') {
            stats.inProgress++;
        }

        // Calculate overdue tasks
        const dueDate = new Date(task.due_date);
        if (dueDate < now && status !== 'Completed') {
            stats.overdue++;
            const daysDiff = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));
            const existingOverdue = stats.overdueByPriority.find(o => o.name === task.priority);
            if (existingOverdue) {
                existingOverdue.value++;
                existingOverdue.days += daysDiff;
            } else {
                stats.overdueByPriority.push({ name: task.priority, value: 1, days: daysDiff });
            }
        }

        // Calculate completion time for completed tasks
        if (status === 'Completed' && task.task_assignments[0]?.completed_at) {
            const startDate = new Date(task.start_date || task.created_at);
            const completedDate = new Date(task.task_assignments[0].completed_at);
            const completionDays = Math.ceil((completedDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
            totalCompletionDays += completionDays;
            completedTasks++;

            // Add to completion trend
            const completedMonth = completedDate.toLocaleString('default', { month: 'short' });
            const existingTrend = stats.completionTrend.find(t => t.date === completedMonth);
            if (existingTrend) {
                existingTrend.completed++;
            } else {
                stats.completionTrend.push({ date: completedMonth, completed: 1 });
            }

            // Track late completions
            if (completedDate > dueDate) {
                const lateDays = Math.ceil((completedDate.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));
                stats.lateDays.push({ name: task.title, value: lateDays });
            }
        }
    });

    stats.averageCompletionTime = completedTasks > 0 ? totalCompletionDays / completedTasks : 0;

    return stats;
}

function processPerformanceMetrics(performanceData: any[]): DepartmentStats['performance'] {
    if (!performanceData?.length) {
        return {
            avgCompletionTime: 0,
            avgEfficiencyRatio: 0,
            avgQualityRating: 0,
            taskCompletionRate: 0
        };
    }

    const latestMetrics = performanceData[0];
    return {
        avgCompletionTime: latestMetrics.avg_completion_time || 0,
        avgEfficiencyRatio: latestMetrics.efficiency_ratio || 0,
        avgQualityRating: latestMetrics.quality_rating || 0,
        taskCompletionRate: latestMetrics.tasks_completed || 0
    };
}

function processBacklogMetrics(backlogData: any): DepartmentStats['backlog'] {
    const parseInterval = (interval: string) => {
        if (!interval) return 0;
        // Parse PostgreSQL interval string (e.g., "2 days" or "48:00:00")
        const days = interval.match(/(\d+) days?/);
        const hours = interval.match(/(\d+):(\d+):(\d+)/);

        if (days) {
            return parseInt(days[1]);
        } else if (hours) {
            return Math.round(parseInt(hours[1]) / 24);
        }
        return 0;
    };

    return {
        overdueTasks: backlogData.overdue_tasks || 0,
        highPriorityTasks: backlogData.high_priority_tasks || 0,
        avgDelay: parseInterval(backlogData.avg_delay)
    };
}

function processTrends(tasks: any[], performanceData: any[]): DepartmentStats['trends'] {
    const daily: { date: string; completed: number; new: number; }[] = [];
    const efficiency: { date: string; value: number; }[] = [];
    const quality: { date: string; value: number; }[] = [];

    // Process daily task trends
    const tasksByDate = new Map<string, { completed: number; new: number; }>();
    tasks.forEach(task => {
        const createdDate = new Date(task.created_at).toLocaleDateString();
        const completedDate = task.task_assignments[0]?.completed_at
            ? new Date(task.task_assignments[0].completed_at).toLocaleDateString()
            : null;

        // Count new tasks
        if (!tasksByDate.has(createdDate)) {
            tasksByDate.set(createdDate, { completed: 0, new: 1 });
        } else {
            const current = tasksByDate.get(createdDate)!;
            tasksByDate.set(createdDate, { ...current, new: current.new + 1 });
        }

        // Count completed tasks
        if (completedDate) {
            if (!tasksByDate.has(completedDate)) {
                tasksByDate.set(completedDate, { completed: 1, new: 0 });
            } else {
                const current = tasksByDate.get(completedDate)!;
                tasksByDate.set(completedDate, { ...current, completed: current.completed + 1 });
            }
        }
    });

    tasksByDate.forEach((value, date) => {
        daily.push({ date, ...value });
    });

    // Process performance trends
    performanceData.forEach(metric => {
        const date = new Date(metric.measured_at).toLocaleDateString();
        efficiency.push({
            date,
            value: metric.efficiency_ratio || 0
        });
        quality.push({
            date,
            value: metric.quality_rating || 0
        });
    });

    return {
        daily: daily.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        efficiency: efficiency.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        quality: quality.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    };
}

function processTemplates(templates: any[], tasks: any[]): DepartmentStats['templates'] {
    if (!templates?.length) return [];

    return templates.map(template => {
        const templateTasks = tasks.filter(task => task.template_id === template.id);
        const completedTasks = templateTasks.filter(task =>
            task.task_assignments[0]?.status === 'Completed'
        );

        const totalDuration = completedTasks.reduce((sum, task) => {
            if (task.task_assignments[0]?.completed_at && task.start_date) {
                const start = new Date(task.start_date);
                const end = new Date(task.task_assignments[0].completed_at);
                return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
            }
            return sum;
        }, 0);

        return {
            name: template.name,
            usage: templateTasks.length,
            avgDuration: completedTasks.length ? totalDuration / completedTasks.length : 0
        };
    });
}