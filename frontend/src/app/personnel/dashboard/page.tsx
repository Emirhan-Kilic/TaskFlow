'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';

export default function PersonnelDashboard() {
    const router = useRouter();
    const [userData, setUserData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [personalStats, setPersonalStats] = useState({
        activeTasks: 0,
        completedTasks: 0,
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

                if (userData?.role?.toLowerCase() !== 'personnel') {
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
        const fetchPersonalStats = async () => {
            if (!userData?.id) return;

            try {
                const response = await fetch('/api/personnel/stats');
                if (!response.ok) {
                    throw new Error('Failed to fetch personal statistics');
                }
                const stats = await response.json();
                setPersonalStats(stats);
            } catch (error) {
                console.error('Error fetching personal statistics:', error);
                toast.error('Failed to load personal statistics');
            }
        };

        if (userData?.id) {
            fetchPersonalStats();
        }
    }, [userData?.id]);

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
                            <h1 className="text-2xl font-light text-white">My Dashboard</h1>
                            <div className="flex items-center space-x-4">
                                <div className="text-right">
                                    <p className="text-sm text-slate-300">{userData?.display_name}</p>
                                    <p className="text-xs text-slate-400">{userData?.job_title}</p>
                                </div>
                                <button
                                    onClick={() => router.push('/settings')}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Settings
                                </button>
                                <button
                                    onClick={async () => {
                                        await supabase.auth.signOut();
                                        sessionStorage.removeItem('userData');
                                        sessionStorage.removeItem('authToken');
                                        router.push('/');
                                    }}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Dashboard Content */}
                <main className="container mx-auto px-4 py-8">
                    {/* Personal Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Active Tasks</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{personalStats.activeTasks}</p>
                                <div className={`text-sm ${personalStats.activeTasksChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {personalStats.activeTasksChange >= 0 ? '↑' : '↓'} {Math.abs(personalStats.activeTasksChange)}%
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Completed Tasks</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{personalStats.completedTasks}</p>
                                <div className="text-emerald-400 text-sm">This Week</div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Total Tasks</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{personalStats.tasksThisWeek}</p>
                                <div className={`text-sm ${personalStats.tasksThisWeekChange >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                                    {personalStats.tasksThisWeekChange >= 0 ? '↑' : '↓'} {Math.abs(personalStats.tasksThisWeekChange)}%
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Completion Rate</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{personalStats.completionRate}%</p>
                                <div className={`text-sm ${personalStats.completionRateChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {personalStats.completionRateChange >= 0 ? '↑' : '↓'} {Math.abs(personalStats.completionRateChange)}%
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Upcoming Deadlines</h3>
                            <div className="flex items-end justify-between">
                                <p className="text-3xl font-semibold text-white">{personalStats.upcomingDeadlines}</p>
                                <div className="text-orange-400 text-sm">Tasks</div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Task Management */}
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
                            <h2 className="text-xl font-medium text-white mb-4">My Tasks</h2>
                            <div className="space-y-4">
                                <button
                                    onClick={() => router.push('/personnel/tasks/board')}
                                    className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl text-sm transition-all duration-300"
                                >
                                    View Task Board
                                </button>
                            </div>
                        </div>

                        {/* Calendar */}
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
                            <h2 className="text-xl font-medium text-white mb-4">Calendar</h2>
                            <div className="space-y-4">
                                <button
                                    onClick={() => router.push('/personnel/calendar')}
                                    className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl text-sm transition-all duration-300"
                                >
                                    View Calendar
                                </button>
                                <button
                                    onClick={() => router.push('/personnel/calendar/deadlines')}
                                    className="w-full px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 rounded-lg text-sm transition-colors duration-300"
                                >
                                    Upcoming Deadlines
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
