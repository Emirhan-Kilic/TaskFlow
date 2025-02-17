'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';

interface UserData {
    id: number;
    email: string;
    role: 'admin' | 'manager' | 'personnel';
    department_id: number | null;
    profile_picture: string | null;
    display_name: string;
    job_title: string;
    last_login: string | null;
    created_at: string;
    updated_at: string;
    auth_uid: string;
    department_name?: string;
}

export default function Settings() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<UserData | null>(null);

    useEffect(() => {
        const loadUserData = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error || !session) {
                    toast.error('Please login first');
                    router.push('/');
                    return;
                }

                const userData = JSON.parse(sessionStorage.getItem('userData') || 'null');
                if (!userData) {
                    toast.error('User data not found');
                    router.push('/');
                    return;
                }

                if (userData.department_id) {
                    const { data: departmentData, error: deptError } = await supabase
                        .from('departments')
                        .select('name')
                        .eq('id', userData.department_id)
                        .single();

                    if (!deptError && departmentData) {
                        userData.department_name = departmentData.name;
                    }
                }

                setFormData(userData);
            } catch (error) {
                console.error('Data loading error:', error);
                toast.error('Failed to load user data');
            } finally {
                setIsLoading(false);
            }
        };

        loadUserData();
    }, [router]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (formData) {
            setFormData(prev => ({
                ...prev!,
                [name]: value
            }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session || !formData) throw new Error('No session or form data');

            const { error } = await supabase
                .from('users')
                .update({
                    display_name: formData.display_name,
                    job_title: formData.job_title,
                    updated_at: new Date().toISOString()
                })
                .eq('auth_uid', session.user.id);

            if (error) throw error;

            // Update session storage
            sessionStorage.setItem('userData', JSON.stringify(formData));
            toast.success('Profile updated successfully');
        } catch (error) {
            console.error('Update error:', error);
            toast.error('Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading || !formData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 relative overflow-hidden">
            {/* Background effects */}
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
                            <h1 className="text-2xl font-light text-white">Settings</h1>
                            <button
                                onClick={() => router.back()}
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

                {/* Settings Content */}
                <main className="container mx-auto px-4 py-8">
                    {/* Profile Picture Header */}
                    <div className="max-w-3xl mx-auto mb-8 flex flex-col items-center">
                        <div className="h-32 w-32 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-4xl text-white font-medium mb-4">
                            {formData?.display_name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <h1 className="text-2xl font-medium text-white mb-2">{formData?.display_name}</h1>
                        <p className="text-slate-400">{formData?.job_title}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
                        {/* Profile Picture & Basic Info */}
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
                            <h2 className="text-xl font-medium text-white mb-4">Profile Settings</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={formData?.email || ''}
                                        disabled
                                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Display Name
                                    </label>
                                    <input
                                        type="text"
                                        name="display_name"
                                        value={formData?.display_name || ''}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Job Title
                                    </label>
                                    <input
                                        type="text"
                                        name="job_title"
                                        value={formData?.job_title || ''}
                                        onChange={handleInputChange}
                                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Role & Department Info */}
                        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
                            <h2 className="text-xl font-medium text-white mb-4">Organization Details</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Role
                                    </label>
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={formData?.role.charAt(0).toUpperCase() + formData?.role.slice(1) || ''}
                                            disabled
                                            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
                                        />
                                        {formData?.role === 'manager' && (
                                            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm">
                                                Department Manager
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Department
                                    </label>
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={formData?.department_name || 'Not Assigned'}
                                            disabled
                                            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
                                        />
                                        {!formData?.department_id && (
                                            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm">
                                                Pending Assignment
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Member Since
                                    </label>
                                    <input
                                        type="text"
                                        value={new Date(formData?.created_at || '').toLocaleDateString()}
                                        disabled
                                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl text-sm transition-all duration-300 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span>Save Changes</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </main>
            </div>
        </div>
    );
}
