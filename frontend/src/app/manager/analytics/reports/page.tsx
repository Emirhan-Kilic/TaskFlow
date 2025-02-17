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
import jsPDF from 'jspdf';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

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

export default function GenerateReportsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [reportData, setReportData] = useState<string>('');
    const [departmentStats, setDepartmentStats] = useState<DepartmentStats | null>(null);

    useEffect(() => {
        fetchDepartmentStats();
    }, []);

    const fetchDepartmentStats = async () => {
        setIsDataLoading(true);
        try {
            // Get current user's department
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
            if (!user) throw new Error('No user found');

            // Use backend API endpoints instead of direct Supabase queries
            const response = await fetch('/api/reports/department-stats', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch department statistics');
            }

            const data = await response.json();
            setDepartmentStats(data);
        } catch (error) {
            console.error('Error fetching department stats:', error);
            toast.error('Failed to load department statistics');
        } finally {
            setIsDataLoading(false);
        }
    };

    const generateReport = async () => {
        if (!departmentStats) {
            toast.error('Department statistics not loaded');
            return;
        }

        setIsLoading(true);
        try {
            // Generate all graphs asynchronously
            const graphs = {
                taskDistribution: await generateTaskDistributionChart(departmentStats.taskStats),
                priorityBreakdown: await generatePriorityBreakdownChart(departmentStats.taskStats),
                completionTrend: await generateCompletionTrendChart(departmentStats.taskStats.completionTrend),
                efficiencyMetrics: await generateEfficiencyMetricsChart(departmentStats.performance),
                workloadHeatmap: await generateWorkloadHeatmap(departmentStats.taskStats),
                riskAssessment: await generateRiskAssessmentChart(departmentStats)
            };

            // Use backend API to generate report content
            const reportResponse = await fetch('/api/reports/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    departmentStats,
                    metrics: {
                        overdueRate: (departmentStats.taskStats.overdue / departmentStats.taskStats.total) * 100,
                        criticalTaskRate: (departmentStats.taskStats.byPriority.Critical / departmentStats.taskStats.total) * 100,
                        completionRate: (departmentStats.taskStats.completed / departmentStats.taskStats.total) * 100,
                        avgTasksPerEmployee: departmentStats.taskStats.total / departmentStats.employeeCount
                    }
                })
            });

            if (!reportResponse.ok) {
                throw new Error('Failed to generate report content');
            }

            const reportContent = await reportResponse.text();
            setReportData(reportContent);

            // Generate PDF with graphs
            const doc = await generatePDF(reportContent, graphs);

            // Save PDF to backend storage
            const pdfOutput = doc.output('blob');
            const timestamp = new Date().toISOString().split('T')[0];
            const fileName = `${departmentStats.name}_Report_${timestamp}.pdf`;

            // Upload PDF using Supabase storage (keep this as is since it's file storage)
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('reports')
                .upload(`department_reports/${fileName}`, pdfOutput);

            if (uploadError) {
                throw uploadError;
            }

            // Create report record in database using backend API
            const saveResponse = await fetch('/api/reports/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    departmentId: departmentStats.id,
                    filePath: uploadData.path,
                    fileName,
                    fileSize: pdfOutput.size,
                    metrics: {
                        completionRate: departmentStats.performance.taskCompletionRate,
                        efficiencyScore: departmentStats.performance.avgEfficiencyRatio,
                        qualityRating: departmentStats.performance.avgQualityRating
                    }
                })
            });

            if (!saveResponse.ok) {
                throw new Error('Failed to save report record');
            }

            // Get the public URL for the uploaded PDF
            const { data: { publicUrl } } = supabase.storage
                .from('reports')
                .getPublicUrl(`department_reports/${fileName}`);

            // Open the PDF in a new tab
            window.open(publicUrl, '_blank');

        } catch (error) {
            console.error('Error generating report:', error);
            toast.error('Failed to generate report');
        } finally {
            setIsLoading(false);
        }
    };

    // Chart generation helper functions
    const generateTaskDistributionChart = (taskStats: any) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;

        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        // Create and render the chart
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(taskStats.byStatus),
                datasets: [{
                    label: 'Tasks by Status',
                    data: Object.values(taskStats.byStatus),
                    backgroundColor: [
                        STATUS_COLORS['To Do'],
                        STATUS_COLORS['In Progress'],
                        STATUS_COLORS['Under Review'],
                        STATUS_COLORS['Completed']
                    ]
                }]
            },
            options: {
                responsive: false,
                animation: false, // Disable animation for PDF
                plugins: {
                    title: {
                        display: true,
                        text: 'Task Distribution by Status'
                    }
                }
            }
        });

        // Wait for chart rendering
        return new Promise<string>((resolve) => {
            setTimeout(() => {
                resolve(canvas.toDataURL('image/png', 1.0));
            }, 100);
        });
    };

    const generatePriorityBreakdownChart = (taskStats: any) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;

        const ctx = canvas.getContext('2d');
        if (!ctx) return Promise.resolve('');

        const chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(taskStats.byPriority),
                datasets: [{
                    data: Object.values(taskStats.byPriority),
                    backgroundColor: [
                        PRIORITY_COLORS.Critical,
                        PRIORITY_COLORS.High,
                        PRIORITY_COLORS.Medium,
                        PRIORITY_COLORS.Low
                    ]
                }]
            },
            options: {
                responsive: false,
                animation: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Task Distribution by Priority'
                    }
                }
            }
        });

        return new Promise<string>((resolve) => {
            setTimeout(() => {
                resolve(canvas.toDataURL('image/png', 1.0));
            }, 100);
        });
    };

    const generateCompletionTrendChart = (completionTrend: any) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;

        const ctx = canvas.getContext('2d');
        if (!ctx) return Promise.resolve('');

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: completionTrend.map((t: any) => t.date),
                datasets: [{
                    label: 'Completed Tasks',
                    data: completionTrend.map((t: any) => t.completed),
                    borderColor: COLORS.success,
                    backgroundColor: COLORS.success + '20',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: false,
                animation: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Task Completion Trend'
                    },
                    legend: {
                        display: true,
                        position: 'bottom'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Tasks'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                }
            }
        });

        return new Promise<string>((resolve) => {
            setTimeout(() => {
                resolve(canvas.toDataURL('image/png', 1.0));
            }, 100);
        });
    };

    const generateEfficiencyMetricsChart = (performance: any) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;

        const ctx = canvas.getContext('2d');
        if (!ctx) return Promise.resolve('');

        const chart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: [
                    'Task Completion Rate',
                    'Efficiency Ratio',
                    'Quality Rating',
                    'Time Management'
                ],
                datasets: [{
                    label: 'Performance Metrics',
                    data: [
                        performance.taskCompletionRate,
                        performance.avgEfficiencyRatio,
                        performance.avgQualityRating,
                        100 - (performance.avgCompletionTime / 30 * 100) // Normalize to 0-100
                    ],
                    backgroundColor: COLORS.primary + '40',
                    borderColor: COLORS.primary,
                    pointBackgroundColor: COLORS.primary
                }]
            },
            options: {
                responsive: false,
                animation: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Department Efficiency Metrics'
                    }
                },
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: {
                            stepSize: 20
                        }
                    }
                }
            }
        });

        return new Promise<string>((resolve) => {
            setTimeout(() => {
                resolve(canvas.toDataURL('image/png', 1.0));
            }, 100);
        });
    };

    const generateWorkloadHeatmap = (taskStats: any) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;

        const ctx = canvas.getContext('2d');
        if (!ctx) return Promise.resolve('');

        const data = {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            datasets: [{
                label: 'Task Load',
                data: [
                    taskStats.inProgress,
                    taskStats.overdue,
                    taskStats.total - taskStats.completed,
                    taskStats.byPriority.Critical + taskStats.byPriority.High,
                    taskStats.upcoming || 0
                ],
                backgroundColor: (context: any) => {
                    const value = context.raw;
                    if (value > 20) return COLORS.danger;
                    if (value > 15) return COLORS.warning;
                    if (value > 10) return COLORS.orange;
                    return COLORS.success;
                }
            }]
        };

        const chart = new Chart(ctx, {
            type: 'bar',
            data,
            options: {
                responsive: false,
                animation: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weekly Workload Distribution'
                    },
                    legend: {
                        display: true,
                        position: 'bottom'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Tasks'
                        }
                    }
                }
            }
        });

        return new Promise<string>((resolve) => {
            setTimeout(() => {
                resolve(canvas.toDataURL('image/png', 1.0));
            }, 100);
        });
    };

    const generateRiskAssessmentChart = (stats: any) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;

        const ctx = canvas.getContext('2d');
        if (!ctx) return Promise.resolve('');

        const overduePct = (stats.taskStats.overdue / stats.taskStats.total) * 100;
        const criticalPct = (stats.taskStats.byPriority.Critical / stats.taskStats.total) * 100;
        const highPriorityPct = (stats.taskStats.byPriority.High / stats.taskStats.total) * 100;

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Overdue', 'Critical', 'High Priority', 'Normal'],
                datasets: [{
                    data: [
                        overduePct,
                        criticalPct,
                        highPriorityPct,
                        100 - (overduePct + criticalPct + highPriorityPct)
                    ],
                    backgroundColor: [
                        COLORS.danger,
                        COLORS.orange,
                        COLORS.warning,
                        COLORS.success
                    ]
                }]
            },
            options: {
                responsive: false,
                animation: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Risk Assessment Distribution'
                    },
                    legend: {
                        display: true,
                        position: 'bottom'
                    }
                }
            }
        });

        return new Promise<string>((resolve) => {
            setTimeout(() => {
                resolve(canvas.toDataURL('image/png', 1.0));
            }, 100);
        });
    };

    const generatePDF = async (content: string, graphs: any) => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Set default font
        doc.setFont('helvetica');

        // Helper function to add text with proper line breaks
        const addFormattedText = (text: string, startY: number, fontSize: number, isBold: boolean = false) => {
            doc.setFontSize(fontSize);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            const lines = doc.splitTextToSize(text, 170);
            doc.text(lines, 20, startY);
            return startY + (lines.length * (fontSize / 3)) + (fontSize / 4);
        };

        // Add cover page
        doc.setFontSize(28);
        doc.setFont('helvetica', 'bold');
        doc.text('Department Performance Report', 20, 40);

        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 55);
        doc.text(`Department: ${departmentStats?.name}`, 20, 62);

        // Add table of contents
        doc.addPage();
        let yPos = 20;
        yPos = addFormattedText('Table of Contents', yPos, 20, true);
        yPos += 10;

        const sections = [
            'Executive Summary',
            'Performance Analysis',
            'Risk Assessment',
            'Resource Optimization',
            'Strategic Recommendations',
            'Implementation Roadmap',
            'Appendix'
        ];

        sections.forEach((section, index) => {
            yPos = addFormattedText(`${index + 1}. ${section}`, yPos, 12);
            yPos += 5;
        });

        // Process content sections
        const contentSections = content.split('\n\n');
        let currentY = 20;
        let currentPage = 2;

        contentSections.forEach((section) => {
            const trimmedSection = section.trim();

            // Check if it's a main heading (starts with number)
            const isMainHeading = /^\d+\./.test(trimmedSection);
            // Check if it's a subheading (starts with letter)
            const isSubHeading = /^[A-Z]\./.test(trimmedSection);

            // Add new page for main sections
            if (isMainHeading) {
                doc.addPage();
                currentY = 20;
                currentPage++;
            }

            // Calculate space needed for current section
            let fontSize = isMainHeading ? 16 : (isSubHeading ? 14 : 11);
            const lines = doc.splitTextToSize(trimmedSection, 170);
            const sectionHeight = (lines.length * (fontSize / 3)) + (fontSize / 4);

            // Check if we need a new page
            if (currentY + sectionHeight > 280) {
                doc.addPage();
                currentY = 20;
                currentPage++;
            }

            // Add the text with proper formatting
            if (isMainHeading) {
                currentY = addFormattedText(trimmedSection, currentY, 16, true);
                currentY += 5;
            } else if (isSubHeading) {
                currentY = addFormattedText(trimmedSection, currentY, 14, true);
                currentY += 3;
            } else {
                currentY = addFormattedText(trimmedSection, currentY, 11);
                currentY += 2;
            }
        });

        // Add graphs with proper spacing
        Object.entries(graphs).forEach(([name, dataUrl]) => {
            doc.addPage();
            const graphTitle = name.replace(/([A-Z])/g, ' $1').trim();

            try {
                // Add graph title
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text(graphTitle, 20, 20);

                // Add graph with proper dimensions and format
                const imgData = dataUrl.split(',')[1]; // Remove data URL prefix
                doc.addImage(imgData, 'PNG', 20, 30, 170, 85, undefined, 'FAST');

                // Add caption
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text(`Figure: ${graphTitle} Analysis`, 20, 125);
            } catch (error) {
                console.error(`Error adding graph ${name}:`, error);
                doc.setFontSize(12);
                doc.setTextColor(255, 0, 0);
                doc.text(`Error: Could not load ${graphTitle} graph`, 20, 30);
            }
        });

        // Add page numbers
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Page ${i} of ${totalPages}`, 170, 290, { align: 'right' });
        }

        return doc;
    };

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
                            <h1 className="text-2xl font-light text-white">Department Analytics Report</h1>
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
                    </div>
                </header>

                {/* Report Generation Section */}
                <main className="container mx-auto px-4 py-8">
                    <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6">
                        <div className="flex justify-center mb-6">
                            {isDataLoading ? (
                                <div className="flex items-center space-x-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span className="text-white">Loading department data...</span>
                                </div>
                            ) : !departmentStats ? (
                                <div className="text-red-400">
                                    Failed to load department statistics. Please refresh the page.
                                </div>
                            ) : (
                                <button
                                    onClick={generateReport}
                                    disabled={isLoading}
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-300 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                            <span>Generating Report...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            <span>Generate Comprehensive Report</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Report Display */}
                        {reportData && (
                            <div className="bg-slate-700/50 rounded-lg p-6 mt-6">
                                <div className="prose prose-invert max-w-none">
                                    <pre className="whitespace-pre-wrap text-slate-300">
                                        {reportData}
                                    </pre>
                                </div>
                            </div>
                        )}
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