'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';

export default function ManagerDashboard() {
    const router = useRouter();
    const [userData, setUserData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [departmentStats, setDepartmentStats] = useState({
        activeTasks: 0,
        teamMembers: 0,
        tasksThisWeek: 0,
        completionRate: 0,
        upcomingDeadlines: 0,
        activeTasksChange: 0,
        tasksThisWeekChange: 0,
        completionRateChange: 0
    });

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

                if (userData?.role?.toLowerCase() !== 'manager') {
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

    useEffect(() => {
        const fetchDepartmentStats = async () => {
            if (!userData?.department_id) return;

            try {
                const response = await fetch(`/department-stats/${userData.department_id}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch department statistics');
                }
                const stats = await response.json();
                setDepartmentStats(stats);
            } catch (error) {
                console.error('Error fetching department statistics:', error);
                toast.error('Failed to load department statistics');
            }
        };

        if (userData?.department_id) {
            fetchDepartmentStats();
        }
    }, [userData?.department_id]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 relative overflow-hidden">
            {/* Animated background with gradient and orbs */}
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
                        <div className="flex items-center justify-between">
                            <h1 className="text-2xl font-light text-white">Manager Dashboard</h1>
                            <div className="flex items-center space-x-4">
                                <div className="text-right">
                                    <p className="text-sm text-slate-300">{userData?.display_name}</p>
                                    <p className="text-xs text-slate-400">{userData?.job_title}</p>
                                </div>
                                <button
                                    onClick={() => router.push('/settings')}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors duration-300 flex items-center space-x-2"
                                >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                        />
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                        />
                                    </svg>
                                    <span>Settings</span>
                                </button>
                                <button
                                    onClick={async () => {
                                        await supabase.auth.signOut();
                                        sessionStorage.removeItem('userData');
                                        sessionStorage.removeItem('authToken');
                                        router.push('/');
                                    }}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors duration-300 flex items-center space-x-2"
                                >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                        />
                                    </svg>
                                    <span>Sign Out</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Dashboard Content */}
                <main className="container mx-auto px-4 py-8">
                    {/* Department Overview Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Active Tasks</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{departmentStats.activeTasks}</p>
                                <div className={`text-sm ${departmentStats.activeTasksChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {departmentStats.activeTasksChange >= 0 ? '↑' : '↓'} {Math.abs(departmentStats.activeTasksChange)}%
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Team Members</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{departmentStats.teamMembers}</p>
                                <div className="text-blue-400 text-sm">Active</div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Tasks This Week</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{departmentStats.tasksThisWeek}</p>
                                <div className={`text-sm ${departmentStats.tasksThisWeekChange >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                                    {departmentStats.tasksThisWeekChange >= 0 ? '↑' : '↓'} {Math.abs(departmentStats.tasksThisWeekChange)}%
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Completion Rate</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{departmentStats.completionRate}%</p>
                                <div className={`text-sm ${departmentStats.completionRateChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {departmentStats.completionRateChange >= 0 ? '↑' : '↓'} {Math.abs(departmentStats.completionRateChange)}%
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Upcoming Deadlines</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{departmentStats.upcomingDeadlines}</p>
                                <div className="text-orange-400 text-sm">This Week</div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions - Integrated into first row of cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Task Management Card with Quick Actions */}
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
                            <h2 className="text-xl font-medium text-white mb-4">Task Management</h2>
                            <div className="space-y-4">
                                <button
                                    onClick={() => router.push('/manager/tasks/create')}
                                    className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl text-sm transition-all duration-300 flex items-center justify-center space-x-2"
                                >
                                    <span>Create New Task</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => router.push('/manager/tasks/board')}
                                    className="w-full px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    View Kanban Board
                                </button>
                                <button
                                    onClick={() => router.push('/manager/tasks/templates')}
                                    className="w-full px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Task Templates
                                </button>
                            </div>
                        </div>

                        {/* Calendar Card with Quick Access */}
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
                            <h2 className="text-xl font-medium text-white mb-4">Calendar & Scheduling</h2>
                            <div className="space-y-4">
                                <button
                                    onClick={() => router.push('/manager/calendar')}
                                    className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl text-sm transition-all duration-300 flex items-center justify-center space-x-2"
                                >
                                    <span>View Calendar</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => router.push('/manager/calendar/deadlines')}
                                    className="w-full px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Upcoming Deadlines
                                </button>
                            </div>
                        </div>

                        {/* Team Management Card */}
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
                            <h2 className="text-xl font-medium text-white mb-4">Team Management</h2>
                            <div className="space-y-4">
                                <button
                                    onClick={() => router.push('/manager/team')}
                                    className="w-full px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    View Team Members
                                </button>
                                <button
                                    onClick={() => router.push('/manager/team/workload')}
                                    className="w-full px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Workload Distribution
                                </button>
                                <button
                                    onClick={() => router.push('/manager/team/organization-chart')}
                                    className="w-full px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Organization Chart
                                </button>
                            </div>
                        </div>

                        {/* Department Overview Card - Repositioned */}
                        <div className="md:col-start-2 md:col-span-1 p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
                            <h2 className="text-xl font-medium text-white mb-4">Department Overview</h2>
                            <div className="space-y-4">
                                <button
                                    onClick={() => router.push('/manager/department/overview')}
                                    className="w-full px-4 py-2 bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Department Stats
                                </button>
                                <button
                                    onClick={() => router.push('/manager/analytics/reports')}
                                    className="w-full px-4 py-2 bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Generate Reports
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
