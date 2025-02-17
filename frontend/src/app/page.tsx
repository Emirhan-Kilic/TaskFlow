'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../app/supabaseClient';
import toast from 'react-hot-toast';
import { LoginForm } from '@/components/LoginForm';
import { RegisterForm } from '@/components/RegisterForm';
import { AnimatedGrid } from '@/components/AnimatedGrid';
import { ContinueAsUser } from '@/components/ContinueAsUser';

export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [existingUser, setExistingUser] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
        const checkExistingSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error || !session) {
                    setIsLoading(false);
                    return;
                }

                const userData = JSON.parse(sessionStorage.getItem('userData') || 'null');

                if (userData) {
                    setExistingUser(userData);
                } else {
                    const { data: userData, error: userError } = await supabase
                        .from('users')
                        .select('*')
                        .eq('auth_uid', session.user.id)
                        .single();

                    if (!userError && userData) {
                        sessionStorage.setItem('userData', JSON.stringify(userData));
                        sessionStorage.setItem('authToken', session.access_token);
                        setExistingUser(userData);
                    }
                }
            } catch (error) {
                console.error('Session check error:', error);
            } finally {
                setIsLoading(false);
            }
        };

        checkExistingSession();
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden">
            {/* Grid background */}
            <AnimatedGrid />

            {/* Animated background with restored orbs */}
            <div className="absolute inset-0 overflow-hidden z-10 pointer-events-none">
                {/* Gradient background */}
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10"></div>
                </div>

                {/* Floating orbs with adjusted opacity */}
                <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-float-slow"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float-slower"></div>

                {/* Radial gradient */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_400px_at_50%_300px,#3B82F6,transparent)] opacity-30 animate-pulse"></div>
            </div>

            {/* Main content */}
            <div className="w-full max-w-md p-8 m-4 bg-slate-900/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-700/50 relative z-20">
                {/* Glassmorphism effect header */}
                <div className="mb-8 relative">
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-20 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                    <h1 className="text-4xl font-light mb-3 text-white text-center tracking-wide">
                        {existingUser ? 'Welcome Back' : (isLogin ? 'Sign In' : 'Join TaskFlow')}
                    </h1>
                    <p className="text-center text-slate-400 text-sm">
                        {existingUser ? 'Continue to your workspace' : (isLogin ? 'Access your workspace' : 'Begin your journey')}
                    </p>
                </div>

                {existingUser ? (
                    <ContinueAsUser
                        userData={existingUser}
                        onLogout={() => setExistingUser(null)}
                    />
                ) : (
                    <>
                        {isLogin ? <LoginForm /> : <RegisterForm setIsLogin={setIsLogin} />}
                        <div className="mt-8 text-center">
                            <button
                                onClick={() => setIsLogin(!isLogin)}
                                className="text-sm text-slate-400 hover:text-white transition-colors duration-300"
                            >
                                {isLogin
                                    ? 'New to TaskFlow? Create an account'
                                    : 'Already have an account? Sign in'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
