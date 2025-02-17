'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '../app/supabaseClient';
import toast from 'react-hot-toast';

export function ContinueAsUser({
    userData,
    onLogout
}: {
    userData: { display_name: string; role: string; },
    onLogout: () => void
}) {
    const router = useRouter();

    const handleContinue = () => {
        const userRole = userData.role.toLowerCase();
        switch (userRole) {
            case 'admin':
                router.push('/admin/dashboard');
                break;
            case 'manager':
                router.push('/manager/dashboard');
                break;
            case 'personnel':
                router.push('/personnel/dashboard');
                break;
            default:
                toast.error('Unknown user role');
        }
    };

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            sessionStorage.removeItem('userData');
            sessionStorage.removeItem('authToken');
            onLogout();
            toast.success('Successfully logged out');
        } catch (error) {
            console.error('Logout error:', error);
            toast.error('Error logging out');
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center space-y-2">
                <div className="h-20 w-20 mx-auto bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-2xl text-white font-medium">
                    {userData.display_name.split(' ').map(n => n[0]).join('')}
                </div>
                <h2 className="text-xl font-medium text-white">
                    Welcome back, {userData.display_name}
                </h2>
                <p className="text-sm text-slate-400">
                    Would you like to continue with your session?
                </p>
            </div>

            <button
                onClick={handleContinue}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-2xl transition-all duration-300 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
                Continue as {userData.display_name}
            </button>

            <button
                onClick={handleLogout}
                className="w-full py-4 px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-2xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
                Log Out
            </button>
        </div>
    );
} 