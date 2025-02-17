'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/app/supabaseClient';
import { toast } from 'react-hot-toast';

// Database types
type role_enum = 'admin' | 'manager' | 'personnel';

interface User {
    id: number;
    department_id: number;
    role: role_enum;
    display_name: string;
    job_title: string;
    email: string;
    profile_picture: string | null;
}

interface Department {
    id: number;
    name: string;
    manager_id: number;
    description: string;
}

interface Subdepartment {
    id: number;
    department_id: number;
    name: string;
    manager_id: number | null;
    description: string;
}

interface SubdepartmentParticipation {
    id: number;
    subdepartment_id: number;
    user_id: number;
    role: string;
}

// Organizational node type for the chart
interface OrgNode {
    user: User;
    children: OrgNode[];
    role: 'admin' | 'department-manager' | 'subdepartment-manager' | 'member';
    department?: string;
    subdepartment?: string;
}

export default function OrganizationChartPage() {
    const router = useRouter();
    const [orgData, setOrgData] = useState<OrgNode | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Auth check
                const { data: { session }, error: authError } = await supabase.auth.getSession();
                if (authError || !session) {
                    toast.error('Please login first');
                    router.push('/');
                    return;
                }

                // Fetch all necessary data
                const [
                    { data: users },
                    { data: departments },
                    { data: subdepartments },
                    { data: participations }
                ] = await Promise.all([
                    supabase.from('users').select('*'),
                    supabase.from('departments').select('*'),
                    supabase.from('subdepartments').select('*'),
                    supabase.from('subdepartmentparticipations').select('*')
                ]);

                if (!users || !departments || !subdepartments || !participations) {
                    throw new Error('Failed to fetch data');
                }

                // Find admin
                const admin = users.find(user => user.role === 'admin');
                if (!admin) {
                    throw new Error('No admin found');
                }

                // Build org chart
                const orgChart: OrgNode = {
                    user: admin,
                    children: [],
                    role: 'admin'
                };

                // Add department managers and their members
                departments.forEach(dept => {
                    const manager = users.find(u => u.id === dept.manager_id);
                    if (manager) {
                        const managerNode: OrgNode = {
                            user: manager,
                            children: [],
                            role: 'department-manager',
                            department: dept.name
                        };

                        // Add subdepartment managers
                        const deptSubdepartments = subdepartments.filter(sub => sub.department_id === dept.id);
                        deptSubdepartments.forEach(subdept => {
                            const subManager = users.find(u => u.id === subdept.manager_id);
                            if (subManager) {
                                const subManagerNode: OrgNode = {
                                    user: subManager,
                                    children: [],
                                    role: 'subdepartment-manager',
                                    department: dept.name,
                                    subdepartment: subdept.name
                                };

                                // Add subdepartment members
                                const subMembers = participations
                                    .filter(p => p.subdepartment_id === subdept.id)
                                    .map(p => users.find(u => u.id === p.user_id))
                                    .filter(u => u && u.id !== subManager.id)
                                    .map(u => ({
                                        user: u!,
                                        children: [],
                                        role: 'member',
                                        department: dept.name,
                                        subdepartment: subdept.name
                                    }));

                                subManagerNode.children = subMembers;
                                managerNode.children.push(subManagerNode);
                            }
                        });

                        // Add department members who aren't in subdepartments
                        const deptMembers = users.filter(u =>
                            u.department_id === dept.id &&
                            u.id !== manager.id &&
                            !participations.some(p => p.user_id === u.id)
                        ).map(u => ({
                            user: u,
                            children: [],
                            role: 'member',
                            department: dept.name
                        }));

                        managerNode.children.push(...deptMembers);
                        orgChart.children.push(managerNode);
                    }
                });

                setOrgData(orgChart);
            } catch (error) {
                console.error('Error fetching data:', error);
                toast.error('Failed to load organization chart');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [router]);

    const OrgNodeComponent = ({ node }: { node: OrgNode }) => {
        const isDepartmentManager = node.role === 'department-manager';
        const isSubdepartmentManager = node.role === 'subdepartment-manager';

        return (
            <div className="flex flex-col items-center">
                {/* Node container */}
                <div className={`
                    relative p-4 rounded-xl backdrop-blur-sm
                    ${isDepartmentManager ? 'bg-slate-800/30 border-2 border-slate-700/50 min-w-[280px]' :
                        isSubdepartmentManager ? 'bg-slate-800/50 border border-slate-600/50 min-w-[240px]' :
                            'bg-slate-800/80 min-w-[200px]'}
                `}>
                    {/* Department/Subdepartment label */}
                    {(isDepartmentManager || isSubdepartmentManager) && (
                        <div className="absolute -top-3 left-4 px-2 py-1 rounded-md text-xs font-medium bg-slate-800">
                            {isDepartmentManager ? node.department : node.subdepartment}
                        </div>
                    )}

                    {/* User info */}
                    <div className="flex flex-col items-center">
                        <div className="h-16 w-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xl text-white font-medium">
                            {node.user.display_name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="mt-2 text-center">
                            <h3 className="text-white font-medium text-sm">{node.user.display_name}</h3>
                            <p className="text-slate-400 text-xs">{node.user.job_title}</p>
                            <p className="text-slate-500 text-xs mt-1">
                                {node.role === 'admin' ? 'Administrator' :
                                    isDepartmentManager ? `${node.department} Manager` :
                                        isSubdepartmentManager ? `${node.subdepartment} Manager` :
                                            `${node.subdepartment || node.department} Member`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Children container */}
                {node.children.length > 0 && (
                    <div className="relative mt-4">
                        {/* Vertical line from parent to horizontal line */}
                        <div className="absolute top-0 left-1/2 w-px h-8 -translate-x-1/2 bg-slate-700"></div>

                        {/* Children wrapper */}
                        <div className="pt-8 flex justify-center">
                            <div className="relative flex gap-8">
                                {/* Horizontal line connecting all children */}
                                {node.children.length > 1 && (
                                    <div className="absolute top-0 left-0 right-0 h-px bg-slate-700"></div>
                                )}

                                {/* Render children */}
                                {node.children.map((child, index) => (
                                    <div key={child.user.id} className="relative">
                                        {/* Vertical line to child */}
                                        <div className="absolute top-0 left-1/2 w-px h-8 -translate-x-1/2 bg-slate-700"></div>
                                        <OrgNodeComponent node={child} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

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
                            <h1 className="text-2xl font-light text-white">Organization Chart</h1>
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

                {/* Main content area */}
                <main className="container mx-auto px-4 py-16 overflow-x-auto">
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl shadow-xl p-12 min-w-max">
                        {orgData && <OrgNodeComponent node={orgData} />}
                    </div>
                </main>
            </div>
        </div>
    );
}