'use client';

import { useState } from 'react';
import { supabase } from '../app/supabaseClient';
import toast from 'react-hot-toast';

export function RegisterForm({ setIsLogin }: { setIsLogin: (value: boolean) => void }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [department, setDepartment] = useState('');

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email,
                password: password,
            });

            if (authError) {
                console.error('Registration error:', authError);
                toast.error('Registration failed: ' + authError.message);
                return;
            }

            if (authData?.user) {
                const { error: profileError } = await supabase
                    .from('users')
                    .insert([
                        {
                            auth_uid: authData.user.id,
                            email: email,
                            display_name: displayName,
                            job_title: jobTitle,
                            role: 'personnel'
                        }
                    ]);

                if (profileError) {
                    console.error('Profile creation error:', profileError);
                    toast.error('Profile creation failed: ' + profileError.message);
                    return;
                }

                toast.success('Registration successful! Please Log In to continue.', {
                    duration: 5000,
                    style: {
                        borderRadius: '10px',
                        background: '#333',
                        color: '#fff',
                    }
                });

                // Switch to login form after 2 seconds
                setTimeout(() => {
                    setIsLogin(true);
                }, 2000);
            }
        } catch (error) {
            console.error('Authentication error:', error);
            toast.error('An error occurred during authentication');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2 group">
                <label className="text-sm font-medium text-slate-300 flex items-center space-x-2">
                    <span className="group-focus-within:text-blue-400 transition-colors duration-300">Email</span>
                </label>
                <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-4 bg-slate-800/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 text-white placeholder-slate-500 outline-none hover:border-slate-600"
                    required
                />
            </div>

            <div className="space-y-2 group">
                <label className="text-sm font-medium text-slate-300 flex items-center space-x-2">
                    <span className="group-focus-within:text-blue-400 transition-colors duration-300">Display Name</span>
                </label>
                <input
                    type="text"
                    placeholder="John Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full p-4 bg-slate-800/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 text-white placeholder-slate-500 outline-none hover:border-slate-600"
                    required
                />
            </div>

            <div className="space-y-2 group">
                <label className="text-sm font-medium text-slate-300 flex items-center space-x-2">
                    <span className="group-focus-within:text-blue-400 transition-colors duration-300">Job Title</span>
                </label>
                <input
                    type="text"
                    placeholder="Software Engineer"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full p-4 bg-slate-800/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 text-white placeholder-slate-500 outline-none hover:border-slate-600"
                    required
                />
            </div>

            <div className="space-y-2 group">
                <label className="text-sm font-medium text-slate-300 flex items-center space-x-2">
                    <span className="group-focus-within:text-blue-400 transition-colors duration-300">Password</span>
                </label>
                <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-4 bg-slate-800/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 text-white placeholder-slate-500 outline-none hover:border-slate-600"
                    required
                />
            </div>

            <button
                type="submit"
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-2xl transition-all duration-300 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 relative overflow-hidden group"
            >
                <span className="relative z-10 flex items-center justify-center">
                    Create Account
                    <svg className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </span>
            </button>
        </form>
    );
} 