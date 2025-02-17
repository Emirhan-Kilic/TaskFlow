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

interface Subdepartment {
    id: number;
    department_id: number;
    name: string;
    description: string | null;
    manager_id: number | null;
    employee_count: number;
    created_at: string;
    updated_at: string;
}

interface SubdepartmentParticipation {
    id: number;
    subdepartment_id: number;
    user_id: number;
    role: string;
    joined_at: string;
}

// Add new types for member management
interface MemberAssignment {
    userId: number;
    subdepartmentId: number;
    role: string;
}

interface SubdepartmentWithManager extends Subdepartment {
    manager: User | null;
}

export default function DepartmentOverviewPage() {
    const router = useRouter();
    const [userData, setUserData] = useState<User | null>(null);
    const [teamMembers, setTeamMembers] = useState<User[]>([]);
    const [subdepartments, setSubdepartments] = useState<Subdepartment[]>([]);
    const [participations, setParticipations] = useState<SubdepartmentParticipation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateSubdepartment, setShowCreateSubdepartment] = useState(false);
    const [newSubdepartment, setNewSubdepartment] = useState({
        name: '',
        description: '',
    });
    const [selectedSubdepartment, setSelectedSubdepartment] = useState<Subdepartment | null>(null);
    const [isEditingMembers, setIsEditingMembers] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set());
    const [memberRole, setMemberRole] = useState('member');
    const [subdepartmentsWithManagers, setSubdepartmentsWithManagers] = useState<SubdepartmentWithManager[]>([]);
    const [isAssigningManager, setIsAssigningManager] = useState(false);
    const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);

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

                const storedUserData = sessionStorage.getItem('userData');
                const userData: User | null = storedUserData ? JSON.parse(storedUserData) : null;

                if (!userData || userData.role !== 'manager') {
                    toast.error('Unauthorized access');
                    router.push('/');
                    return;
                }

                setUserData(userData);

                // Fetch team members
                const { data: members, error: membersError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('department_id', userData.department_id);

                if (membersError) throw membersError;
                setTeamMembers(members);

                // Enhanced subdepartments fetch with manager data
                const { data: subs, error: subsError } = await supabase
                    .from('subdepartments')
                    .select(`
                        *,
                        manager:manager_id(
                            id,
                            display_name,
                            job_title,
                            profile_picture,
                            role
                        )
                    `)
                    .eq('department_id', userData.department_id);

                if (subsError) throw subsError;
                setSubdepartmentsWithManagers(subs);

                // Fetch participations
                const { data: parts, error: partsError } = await supabase
                    .from('subdepartmentparticipations')
                    .select('*');

                if (partsError) throw partsError;
                setParticipations(parts);

            } catch (error) {
                console.error('Error fetching data:', error);
                toast.error('Failed to load team overview');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [router]);

    const createSubdepartment = async () => {
        try {
            if (!userData) return;

            const { data, error } = await supabase
                .from('subdepartments')
                .insert([
                    {
                        department_id: userData.department_id,
                        name: newSubdepartment.name,
                        description: newSubdepartment.description,
                        manager_id: null,
                        employee_count: 0
                    }
                ])
                .select(`
                    *,
                    manager:manager_id(
                        id,
                        display_name,
                        job_title,
                        profile_picture,
                        role
                    )
                `)
                .single();

            if (error) throw error;

            setSubdepartmentsWithManagers([...subdepartmentsWithManagers, data]);
            setShowCreateSubdepartment(false);
            setNewSubdepartment({ name: '', description: '' });
            toast.success('Subdepartment created successfully');
        } catch (error) {
            console.error('Error creating subdepartment:', error);
            toast.error('Failed to create subdepartment');
        }
    };

    const assignToSubdepartment = async (userId: number, subdepartmentId: number, role: string = 'member') => {
        try {
            const response = await fetch('/api/subdepartments/assign-member', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    subdepartment_id: subdepartmentId,
                    user_id: userId,
                    role: role
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to assign member');
            }

            // Refresh data after successful assignment
            await refreshData();
            toast.success('Member assigned successfully');
        } catch (error) {
            console.error('Error assigning member:', error);
            toast.error('Failed to assign member');
        }
    };

    const assignManager = async (subdepartmentId: number, managerId: number | null) => {
        try {
            const response = await fetch('/api/subdepartments/assign-manager', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    subdepartment_id: subdepartmentId,
                    manager_id: managerId
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to assign manager');
            }

            // Refresh data
            const { data: updatedSubs, error: refreshError } = await supabase
                .from('subdepartments')
                .select(`
                    *,
                    manager:manager_id(
                        id,
                        display_name,
                        job_title,
                        profile_picture,
                        role
                    )
                `)
                .eq('department_id', userData?.department_id);

            if (refreshError) throw refreshError;
            setSubdepartmentsWithManagers(updatedSubs);

            toast.success(managerId ? 'Manager assigned successfully' : 'Manager removed successfully');
            setIsAssigningManager(false);
            setSelectedSubdepartment(null);
        } catch (error) {
            console.error('Error managing manager:', error);
            toast.error('Failed to update manager');
        }
    };

    const removeFromSubdepartment = async (userId: number, subdepartmentId: number) => {
        try {
            const response = await fetch('/api/subdepartments/remove-member', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    subdepartment_id: subdepartmentId,
                    user_id: userId
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to remove member');
            }

            // Refresh data after successful removal
            await refreshData();
            toast.success('Member removed successfully');
        } catch (error) {
            console.error('Error removing member:', error);
            toast.error('Failed to remove member');
        }
    };

    const deleteSubdepartment = async (subdepartmentId: number) => {
        try {
            const { error } = await supabase
                .from('subdepartments')
                .delete()
                .eq('id', subdepartmentId);

            if (error) throw error;

            setSubdepartmentsWithManagers(subdepartmentsWithManagers.filter(s => s.id !== subdepartmentId));
            toast.success('Subdepartment deleted successfully');
        } catch (error) {
            console.error('Error deleting subdepartment:', error);
            toast.error('Failed to delete subdepartment');
        }
    };

    const refreshData = async () => {
        if (!userData) return;

        const [{ data: subs }, { data: parts }] = await Promise.all([
            supabase.from('subdepartments').select('*').eq('department_id', userData.department_id),
            supabase.from('subdepartmentparticipations').select('*')
        ]);

        if (subs) setSubdepartments(subs);
        if (parts) setParticipations(parts);
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
                            <h1 className="text-2xl font-light text-white">Team Members</h1>
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
                <main className="container mx-auto px-4 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Team Members Section - 5 columns */}
                        <div className="lg:col-span-5">
                            <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl shadow-xl p-6">
                                <h2 className="text-xl font-semibold text-white mb-6">Team Members</h2>
                                <div className="space-y-4">
                                    {teamMembers.map((member) => (
                                        <div key={member.id}
                                            className="group flex items-center justify-between bg-slate-700/50 rounded-xl p-4 hover:bg-slate-700/70 transition-all duration-200">
                                            <div className="flex items-center space-x-4">
                                                {member.profile_picture ? (
                                                    <img src={member.profile_picture} alt="" className="w-10 h-10 rounded-full" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
                                                        <span className="text-slate-300">{member.display_name?.[0]}</span>
                                                    </div>
                                                )}
                                                <div>
                                                    <h3 className="text-white">{member.display_name}</h3>
                                                    <p className="text-slate-400 text-sm">{member.job_title}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-3">
                                                <span className="px-3 py-1 text-sm bg-slate-600/50 rounded-full text-slate-300">
                                                    {member.role}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Subdepartments Section - 7 columns */}
                        <div className="lg:col-span-7">
                            <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl shadow-xl p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-semibold text-white">Subdepartments</h2>
                                    <button
                                        onClick={() => setShowCreateSubdepartment(true)}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all duration-200 flex items-center space-x-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        <span>Create New</span>
                                    </button>
                                </div>

                                {showCreateSubdepartment && (
                                    <div className="mb-6 bg-slate-700/50 rounded-lg p-4">
                                        <input
                                            type="text"
                                            placeholder="Subdepartment Name"
                                            className="w-full mb-2 p-2 bg-slate-600 text-white rounded"
                                            value={newSubdepartment.name}
                                            onChange={(e) => setNewSubdepartment({ ...newSubdepartment, name: e.target.value })}
                                        />
                                        <textarea
                                            placeholder="Description"
                                            className="w-full mb-2 p-2 bg-slate-600 text-white rounded"
                                            value={newSubdepartment.description}
                                            onChange={(e) => setNewSubdepartment({ ...newSubdepartment, description: e.target.value })}
                                        />
                                        <div className="flex justify-end space-x-2">
                                            <button
                                                onClick={() => setShowCreateSubdepartment(false)}
                                                className="px-4 py-2 bg-slate-600 text-white rounded"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={createSubdepartment}
                                                className="px-4 py-2 bg-blue-600 text-white rounded"
                                            >
                                                Create
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-6">
                                    {subdepartmentsWithManagers.map((subdepartment) => (
                                        <div key={subdepartment.id}
                                            className="bg-slate-700/50 rounded-xl p-6 hover:bg-slate-700/70 transition-all duration-200">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="text-lg font-medium text-white mb-2">{subdepartment.name}</h3>
                                                    <p className="text-slate-400 text-sm">{subdepartment.description}</p>
                                                </div>
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => setSelectedSubdepartment(subdepartment)}
                                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all duration-200"
                                                    >
                                                        Manage Members
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedSubdepartment(subdepartment);
                                                            setIsAssigningManager(true);
                                                        }}
                                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-all duration-200"
                                                    >
                                                        Manage Manager
                                                    </button>
                                                    <button
                                                        onClick={() => deleteSubdepartment(subdepartment.id)}
                                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-all duration-200"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Manager Display */}
                                            {subdepartment.manager && (
                                                <div className="mb-4 p-3 bg-slate-600/50 rounded-lg">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="text-sm text-slate-400">Manager:</div>
                                                        <div className="flex items-center space-x-2">
                                                            {subdepartment.manager.profile_picture ? (
                                                                <img
                                                                    src={subdepartment.manager.profile_picture}
                                                                    alt=""
                                                                    className="w-6 h-6 rounded-full"
                                                                />
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-full bg-slate-500 flex items-center justify-center">
                                                                    <span className="text-xs text-white">
                                                                        {subdepartment.manager.display_name[0]}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <span className="text-white text-sm">
                                                                {subdepartment.manager.display_name}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Members list */}
                                            <div className="flex flex-wrap gap-2">
                                                {participations
                                                    .filter(p => p.subdepartment_id === subdepartment.id)
                                                    .map(p => {
                                                        const member = teamMembers.find(m => m.id === p.user_id);
                                                        return member ? (
                                                            <div key={p.id}
                                                                className="flex items-center bg-slate-600/50 rounded-full px-3 py-1.5 hover:bg-slate-600 transition-all duration-200">
                                                                <div className="flex items-center space-x-2">
                                                                    {member.profile_picture ? (
                                                                        <img
                                                                            src={member.profile_picture}
                                                                            alt=""
                                                                            className="w-6 h-6 rounded-full"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-6 h-6 rounded-full bg-slate-500 flex items-center justify-center">
                                                                            <span className="text-xs text-white">
                                                                                {member.display_name[0]}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    <span className="text-sm text-slate-300">
                                                                        {member.display_name}
                                                                        {p.role === 'manager' && (
                                                                            <span className="ml-1 text-blue-400">(Manager)</span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                {userData?.id !== member.id && (
                                                                    <button
                                                                        onClick={() => removeFromSubdepartment(member.id, subdepartment.id)}
                                                                        className="ml-2 text-slate-400 hover:text-red-400 transition-colors duration-200"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : null;
                                                    })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Manager Assignment Modal */}
            {selectedSubdepartment && isAssigningManager && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
                        <h3 className="text-xl text-white mb-6">Assign Manager - {selectedSubdepartment.name}</h3>

                        <div className="space-y-4 mb-6">
                            {teamMembers.map(member => (
                                <div key={member.id}
                                    className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-all duration-200">
                                    <div className="flex items-center space-x-3">
                                        {member.profile_picture ? (
                                            <img src={member.profile_picture} alt="" className="w-8 h-8 rounded-full" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                                                <span className="text-white">{member.display_name[0]}</span>
                                            </div>
                                        )}
                                        <span className="text-white">{member.display_name}</span>
                                    </div>
                                    <button
                                        onClick={() => assignManager(selectedSubdepartment.id, member.id)}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all duration-200"
                                    >
                                        Assign
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between">
                            {selectedSubdepartment.manager_id && (
                                <button
                                    onClick={() => assignManager(selectedSubdepartment.id, null)}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-all duration-200"
                                >
                                    Remove Current Manager
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setIsAssigningManager(false);
                                    setSelectedSubdepartment(null);
                                }}
                                className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 transition-all duration-200"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Existing Member Management Modal */}
            {selectedSubdepartment && !isAssigningManager && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-xl text-white mb-4">Manage Members - {selectedSubdepartment.name}</h3>

                        <div className="space-y-4 mb-4">
                            {teamMembers.map(member => {
                                const isAssigned = participations.some(
                                    p => p.subdepartment_id === selectedSubdepartment.id && p.user_id === member.id
                                );
                                return (
                                    <div key={member.id} className="flex items-center justify-between">
                                        <span className="text-white">{member.display_name}</span>
                                        {isAssigned ? (
                                            <button
                                                onClick={() => removeFromSubdepartment(member.id, selectedSubdepartment.id)}
                                                className="px-3 py-1 bg-red-600 text-white rounded-md text-sm"
                                            >
                                                Remove
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => assignToSubdepartment(member.id, selectedSubdepartment.id)}
                                                className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm"
                                            >
                                                Add
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setSelectedSubdepartment(null)}
                                className="px-4 py-2 bg-slate-700 text-white rounded-md"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}