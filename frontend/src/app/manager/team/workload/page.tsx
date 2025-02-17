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

interface User {
    id: bigint;
    department_id: bigint;
    role: string;
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

interface OptimizationSuggestion {
    fromUser: string;
    toUser: string;
    taskId: number;
    taskTitle: string;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    reason: string;
}

interface OptimizationResponse {
    suggestions: OptimizationSuggestion[];
    summary: string;
    impactScore: number;
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

export default function WorkloadDistributionPage() {
    const router = useRouter();
    const [userData, setUserData] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [workloadData, setWorkloadData] = useState<WorkloadData[]>([]);
    const [viewMode, setViewMode] = useState<'tasks' | 'progress' | 'priority'>('tasks');
    const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('week');
    const [optimizationData, setOptimizationData] = useState<OptimizationResponse | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);

    useEffect(() => {
        const fetchWorkloadData = async () => {
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

                // Fetch workload data from backend
                const response = await fetch(`/api/workload/distribution?department_id=${userData.department_id}&time_range=${timeRange}`);

                if (!response.ok) {
                    throw new Error('Failed to fetch workload data');
                }

                const data = await response.json();
                setWorkloadData(data);

            } catch (error) {
                console.error('Error fetching workload data:', error);
                toast.error('Failed to load workload distribution');
            } finally {
                setIsLoading(false);
            }
        };

        fetchWorkloadData();
    }, [router, timeRange]);

    const generateOptimizationSuggestions = async () => {
        setIsOptimizing(true);
        try {
            const response = await fetch('/api/workload/optimize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    department_id: userData?.department_id,
                    workload_data: workloadData
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate optimization suggestions');
            }

            const suggestions = await response.json();
            setOptimizationData(suggestions);
            toast.success('Optimization suggestions generated successfully');
        } catch (error) {
            console.error('Error generating optimization suggestions:', error);
            toast.error('Failed to generate optimization suggestions');
        } finally {
            setIsOptimizing(false);
        }
    };

    const OptimizationPanel = () => (
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-white text-lg">AI Workload Optimization</h3>
                <button
                    onClick={generateOptimizationSuggestions}
                    disabled={isOptimizing}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors duration-300 ${isOptimizing
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                >
                    {isOptimizing ? (
                        <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Analyzing...</span>
                        </div>
                    ) : (
                        'Generate Optimization Suggestions'
                    )}
                </button>
            </div>

            {optimizationData && (
                <div className="space-y-4">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                        <p className="text-white text-sm">{optimizationData.summary}</p>
                        <div className="mt-2 flex items-center">
                            <span className="text-slate-400 text-xs">Impact Score:</span>
                            <div className="ml-2 h-2 w-24 bg-slate-600 rounded-full">
                                <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${optimizationData.impactScore}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {optimizationData.suggestions.map((suggestion, index) => (
                            <div key={index} className="bg-slate-700/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                        <span className="text-white">{suggestion.fromUser}</span>
                                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m-7-7H3" />
                                        </svg>
                                        <span className="text-white">{suggestion.toUser}</span>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-xs ${PRIORITY_COLORS[suggestion.priority]
                                        }`}>
                                        {suggestion.priority}
                                    </span>
                                </div>
                                <p className="text-slate-300 text-sm">{suggestion.taskTitle}</p>
                                <p className="text-slate-400 text-xs mt-1">{suggestion.reason}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

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
                                value={viewMode}
                                onChange={(e) => setViewMode(e.target.value as any)}
                            >
                                <option value="tasks">Task Distribution</option>
                                <option value="progress">Progress Overview</option>
                                <option value="priority">Priority Distribution</option>
                            </select>

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

                <OptimizationPanel />

                {/* Charts and Statistics */}
                <main className="container mx-auto px-4 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Task Distribution Chart */}
                        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-white text-lg mb-4">Task Distribution by Status</h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={workloadData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                        <XAxis dataKey="userName" stroke="#94a3b8" />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', border: 'none' }}
                                            labelStyle={{ color: '#e2e8f0' }}
                                        />
                                        <Legend />
                                        {Object.keys(STATUS_COLORS).map((status) => (
                                            <Bar
                                                key={status}
                                                dataKey={`tasksByStatus.${status}`}
                                                name={status}
                                                stackId="a"
                                                fill={STATUS_COLORS[status as keyof typeof STATUS_COLORS]}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Priority Distribution Chart */}
                        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-white text-lg mb-4">Task Priority Distribution</h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                {
                                                    name: 'Critical',
                                                    value: workloadData.reduce((sum, user) => sum + user.criticalTasks, 0)
                                                },
                                                {
                                                    name: 'High',
                                                    value: workloadData.reduce((sum, user) => sum + user.highPriorityTasks, 0)
                                                },
                                                {
                                                    name: 'Medium',
                                                    value: workloadData.reduce((sum, user) => sum + user.mediumPriorityTasks, 0)
                                                },
                                                {
                                                    name: 'Low',
                                                    value: workloadData.reduce((sum, user) => sum + user.lowPriorityTasks, 0)
                                                }
                                            ]}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={40}
                                            outerRadius={80}
                                            paddingAngle={2}
                                            label={({
                                                cx,
                                                cy,
                                                midAngle,
                                                innerRadius,
                                                outerRadius,
                                                value,
                                                name
                                            }) => {
                                                const RADIAN = Math.PI / 180;
                                                const radius = outerRadius + 20; // Increased spacing for labels
                                                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                                const y = cy + radius * Math.sin(-midAngle * RADIAN);

                                                return (
                                                    <text
                                                        x={x}
                                                        y={y}
                                                        fill="white"
                                                        textAnchor={x > cx ? 'start' : 'end'}
                                                        dominantBaseline="central"
                                                        fontSize="12"
                                                    >
                                                        {`${name} (${value})`}
                                                    </text>
                                                );
                                            }}
                                        >
                                            {workloadData.length > 0 && [
                                                <Cell key="Critical" fill={PRIORITY_COLORS.Critical} />,
                                                <Cell key="High" fill={PRIORITY_COLORS.High} />,
                                                <Cell key="Medium" fill={PRIORITY_COLORS.Medium} />,
                                                <Cell key="Low" fill={PRIORITY_COLORS.Low} />
                                            ]}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', border: 'none' }}
                                            labelStyle={{ color: '#e2e8f0' }}
                                            formatter={(value: number, name: string) => [
                                                `${value} tasks`,
                                                `${name} Priority`
                                            ]}
                                        />
                                        <Legend
                                            verticalAlign="bottom"
                                            height={36}
                                            formatter={(value: string) => (
                                                <span style={{ color: '#e2e8f0' }}>{value} Priority</span>
                                            )}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* New Workload Heat Map */}
                        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-white text-lg mb-4">Team Workload Heat Map</h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={workloadData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                        <XAxis dataKey="userName" stroke="#94a3b8" />
                                        <YAxis
                                            yAxisId="left"
                                            stroke="#94a3b8"
                                            label={{
                                                value: 'Workload Score',
                                                angle: -90,
                                                position: 'insideLeft',
                                                fill: '#94a3b8',
                                                style: { fontSize: '12px' }
                                            }}
                                        />
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            stroke="#94a3b8"
                                            label={{
                                                value: 'Efficiency Rate',
                                                angle: 90,
                                                position: 'insideRight',
                                                fill: '#94a3b8',
                                                style: { fontSize: '12px' }
                                            }}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1e293b',
                                                border: '1px solid #475569',
                                                borderRadius: '0.5rem',
                                                padding: '0.75rem'
                                            }}
                                            labelStyle={{ color: '#e2e8f0' }}
                                        />
                                        <Legend />
                                        <Bar
                                            yAxisId="left"
                                            dataKey="workloadScore"
                                            name="Workload"
                                            fill="#22c55e"
                                            radius={[4, 4, 0, 0]}
                                        >
                                            {workloadData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={
                                                        entry.workloadScore >= WORKLOAD_THRESHOLDS.CRITICAL
                                                            ? '#ef4444'  // Red for critical
                                                            : entry.workloadScore >= WORKLOAD_THRESHOLDS.HIGH
                                                                ? '#f97316'  // Orange for high
                                                                : entry.workloadScore >= WORKLOAD_THRESHOLDS.OPTIMAL
                                                                    ? '#eab308'  // Yellow for optimal
                                                                    : '#22c55e'  // Green for low
                                                    }
                                                />
                                            ))}
                                        </Bar>
                                        <Line
                                            yAxisId="right"
                                            type="monotone"
                                            dataKey="efficiencyRate"
                                            name="Efficiency"
                                            stroke="#a855f7"
                                            strokeWidth={2}
                                            dot={{
                                                fill: '#a855f7',
                                                r: 4
                                            }}
                                            activeDot={{
                                                r: 6,
                                                stroke: '#1e293b',
                                                strokeWidth: 2
                                            }}
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Risk Assessment Matrix */}
                        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-white text-lg mb-4">Risk Assessment Matrix</h3>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart
                                        margin={{ top: 20, right: 70, bottom: 40, left: 40 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                        <XAxis
                                            type="number"
                                            dataKey="workloadScore"
                                            name="Workload"
                                            stroke="#94a3b8"
                                            domain={[0, 100]}
                                            label={{
                                                value: 'Workload Score',
                                                position: 'bottom',
                                                fill: '#94a3b8',
                                                offset: 20,
                                                style: { fontSize: '12px' }
                                            }}
                                            tick={{ fontSize: 12 }}
                                        />
                                        <YAxis
                                            type="number"
                                            dataKey="riskScore"
                                            name="Risk"
                                            stroke="#94a3b8"
                                            domain={[0, 100]}
                                            label={{
                                                value: 'Risk Score',
                                                angle: -90,
                                                position: 'left',
                                                fill: '#94a3b8',
                                                offset: -20,
                                                style: { fontSize: '12px' }
                                            }}
                                            tick={{ fontSize: 12 }}
                                        />

                                        {/* Reference Areas for Risk Zones */}
                                        <ReferenceArea
                                            y1={RISK_THRESHOLDS.CRITICAL}
                                            y2={100}
                                            fill={RISK_COLORS.Critical}
                                            fillOpacity={0.1}
                                        />
                                        <ReferenceArea
                                            y1={RISK_THRESHOLDS.HIGH}
                                            y2={RISK_THRESHOLDS.CRITICAL}
                                            fill={RISK_COLORS.High}
                                            fillOpacity={0.1}
                                        />
                                        <ReferenceArea
                                            y1={RISK_THRESHOLDS.MEDIUM}
                                            y2={RISK_THRESHOLDS.HIGH}
                                            fill={RISK_COLORS.Medium}
                                            fillOpacity={0.1}
                                        />
                                        <ReferenceArea
                                            y1={RISK_THRESHOLDS.LOW}
                                            y2={RISK_THRESHOLDS.MEDIUM}
                                            fill={RISK_COLORS.Low}
                                            fillOpacity={0.1}
                                        />

                                        {/* Enhanced Tooltip */}
                                        <Tooltip
                                            cursor={{ strokeDasharray: '3 3' }}
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const data = payload[0].payload;
                                                const riskLevel = getRiskLevel(data.riskScore);

                                                return (
                                                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
                                                        <div className="font-medium text-white mb-2">
                                                            {data.userName}
                                                        </div>
                                                        <div className="space-y-1 text-sm">
                                                            <div className="text-slate-300">
                                                                Workload: {Math.round(data.workloadScore)}%
                                                            </div>
                                                            <div className="text-slate-300">
                                                                Tasks: {data.taskCount}
                                                            </div>
                                                            <div className="text-slate-300">
                                                                Critical: {data.criticalTasks}
                                                            </div>
                                                            <div className="text-slate-300">
                                                                Progress: {data.averageProgress}%
                                                            </div>
                                                            <div style={{ color: RISK_COLORS[riskLevel] }} className="font-medium mt-2">
                                                                Risk Level: {riskLevel}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />

                                        {/* Custom Legend */}
                                        <Legend
                                            verticalAlign="top"
                                            align="right"
                                            content={({ payload }) => (
                                                <div className="bg-slate-800/80 rounded-lg p-2 mb-4">
                                                    <div className="text-sm text-white mb-2">Team Members</div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {payload?.map((entry: any) => {
                                                            const riskLevel = getRiskLevel(entry.payload.riskScore);
                                                            return (
                                                                <div
                                                                    key={entry.value}
                                                                    className="flex items-center gap-2"
                                                                >
                                                                    <span
                                                                        className="w-3 h-3 rounded-full"
                                                                        style={{
                                                                            backgroundColor: RISK_COLORS[riskLevel]
                                                                        }}
                                                                    />
                                                                    <span className="text-slate-300 text-sm">
                                                                        {entry.payload.userName}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        />

                                        {/* Scatter Points */}
                                        <Scatter
                                            name="Team Members"
                                            data={workloadData}
                                            shape={({ cx, cy, fill }) => (
                                                <g>
                                                    <circle
                                                        cx={cx}
                                                        cy={cy}
                                                        r={8}
                                                        fill={fill}
                                                        stroke="#1e293b"
                                                        strokeWidth={2}
                                                        className="transition-all duration-300"
                                                    />
                                                </g>
                                            )}
                                        >
                                            {workloadData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={RISK_COLORS[getRiskLevel(entry.riskScore)]}
                                                />
                                            ))}
                                        </Scatter>

                                        {/* Reference Lines with Labels */}
                                        {[
                                            { y: RISK_THRESHOLDS.CRITICAL, level: 'Critical' },
                                            { y: RISK_THRESHOLDS.HIGH, level: 'High' },
                                            { y: RISK_THRESHOLDS.MEDIUM, level: 'Medium' }
                                        ].map(({ y, level }) => (
                                            <ReferenceLine
                                                key={level}
                                                y={y}
                                                stroke={RISK_COLORS[level as keyof typeof RISK_COLORS]}
                                                strokeDasharray="3 3"
                                                strokeOpacity={0.8}
                                            >
                                                <Label
                                                    position="right"
                                                    fill={RISK_COLORS[level as keyof typeof RISK_COLORS]}
                                                    fontSize={11}
                                                    offset={5}
                                                >
                                                    {level} Risk ({y}%)
                                                </Label>
                                            </ReferenceLine>
                                        ))}
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Enhanced Individual Workload Cards */}
                        {workloadData.map(user => (
                            <div key={String(user.userId)} className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center space-x-3">
                                        {user.profilePicture ? (
                                            <img
                                                src={user.profilePicture}
                                                alt={user.userName}
                                                className="w-10 h-10 rounded-full"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white">
                                                {user.userName.charAt(0)}
                                            </div>
                                        )}
                                        <div>
                                            <h4 className="text-white font-medium">{user.userName}</h4>
                                            <p className="text-slate-400 text-sm">{user.jobTitle}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-white">{user.taskCount} Tasks</p>
                                        <p className="text-slate-400 text-sm">{user.averageProgress}% Avg. Progress</p>
                                    </div>
                                </div>

                                {/* Progress Bars */}
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-red-400">Critical</span>
                                            <span className="text-slate-400">{user.criticalTasks}</span>
                                        </div>
                                        <div className="w-full bg-slate-700 rounded-full h-2">
                                            <div
                                                className="bg-red-500 h-2 rounded-full"
                                                style={{ width: `${(user.criticalTasks / user.taskCount) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-orange-400">High Priority</span>
                                            <span className="text-slate-400">{user.highPriorityTasks}</span>
                                        </div>
                                        <div className="w-full bg-slate-700 rounded-full h-2">
                                            <div
                                                className="bg-orange-500 h-2 rounded-full"
                                                style={{ width: `${(user.highPriorityTasks / user.taskCount) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Statistics */}
                                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                                    <div className="bg-slate-700/50 rounded-lg p-2">
                                        <p className="text-slate-400">Overdue Tasks</p>
                                        <p className="text-white text-lg">{user.overdueTasks}</p>
                                    </div>
                                    <div className="bg-slate-700/50 rounded-lg p-2">
                                        <p className="text-slate-400">Upcoming Deadlines</p>
                                        <p className="text-white text-lg">{user.upcomingDeadlines}</p>
                                    </div>
                                </div>

                                {/* Add Workload Trend */}
                                <div className="mt-4">
                                    <h5 className="text-white text-sm mb-2">Workload Trend</h5>
                                    <div className="h-20">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={user.workloadTrend.map((value, index) => ({ value, index }))}>
                                                <Area
                                                    type="monotone"
                                                    dataKey="value"
                                                    stroke="#3b82f6"
                                                    fill="#3b82f6"
                                                    fillOpacity={0.2}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Add Risk Indicator */}
                                <div className="mt-4 p-3 rounded-lg" style={{
                                    backgroundColor: `${RISK_COLORS[getRiskLevel(user.riskScore)]}20`
                                }}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium" style={{
                                                color: RISK_COLORS[getRiskLevel(user.riskScore)]
                                            }}>
                                                Risk Level: {getRiskLevel(user.riskScore)}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {getRiskDescription(user.riskScore)}
                                            </span>
                                        </div>
                                        <span className="text-sm text-slate-400">{Math.round(user.riskScore)}%</span>
                                    </div>
                                </div>
                            </div>
                        ))}
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

    // Base risk factors with further increased weights
    const overdueFactor = (userData.overdueTasks / userData.taskCount) * 100;
    const criticalFactor = (userData.criticalTasks / userData.taskCount) * 100;
    const highPriorityFactor = (userData.highPriorityTasks / userData.taskCount) * 100;
    const workloadFactor = Math.max(0, (userData.workloadScore - WORKLOAD_THRESHOLDS.OPTIMAL) * 3.0); // Increased multiplier
    const progressFactor = Math.max(0, 100 - userData.averageProgress);

    // Enhanced risk calculation with even higher weights
    const riskScore = (
        (overdueFactor * 0.45) +          // Increased to 45% weight for overdue tasks
        (criticalFactor * 0.35) +         // Increased to 35% weight for critical tasks
        (highPriorityFactor * 0.20) +     // Increased to 20% weight for high priority tasks
        (workloadFactor * 0.25) +         // Increased to 25% weight for excessive workload
        (progressFactor * 0.15)           // 15% weight for lack of progress
    );

    // Risk amplifiers with increased multipliers
    let amplifiedScore = riskScore;

    // Amplify risk if there are both overdue AND critical tasks
    if (userData.overdueTasks > 0 && userData.criticalTasks > 0) {
        amplifiedScore *= 1.6; // Increased to 60% increase
    }

    // Amplify risk if workload is above critical threshold
    if (userData.workloadScore > WORKLOAD_THRESHOLDS.CRITICAL) {
        amplifiedScore *= 1.5; // Increased to 50% increase
    }

    // Amplify risk if progress is very low (<25%) on high number of tasks
    if (userData.averageProgress < 25 && userData.taskCount > 3) {
        amplifiedScore *= 1.4; // Increased to 40% increase
    }

    // Amplify risk if majority of tasks are high priority or critical
    const highPriorityRatio = (userData.criticalTasks + userData.highPriorityTasks) / userData.taskCount;
    if (highPriorityRatio > 0.4) { // Lowered threshold to 40% high priority or critical
        amplifiedScore *= 1.35; // Increased to 35% increase
    }

    // Add minimum risk floor based on critical tasks
    if (userData.criticalTasks > 0) {
        amplifiedScore = Math.max(amplifiedScore, 50); // Increased to 50% minimum risk if any critical tasks
    }

    // Add minimum risk floor based on overdue tasks
    if (userData.overdueTasks > 0) {
        amplifiedScore = Math.max(amplifiedScore, 45); // Increased to 45% minimum risk if any overdue tasks
    }

    // Add minimum risk floor based on high workload
    if (userData.workloadScore > WORKLOAD_THRESHOLDS.HIGH) {
        amplifiedScore = Math.max(amplifiedScore, 40); // Added minimum 40% risk for high workload
    }

    return Math.min(100, Math.max(0, amplifiedScore));
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