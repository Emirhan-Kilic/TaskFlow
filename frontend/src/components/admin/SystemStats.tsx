import { useAdminData } from '@/hooks/useAdminData';

export function SystemStats() {
    const { stats } = useAdminData();

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Total Users</h3>
                <p className="text-3xl font-semibold text-white">{stats?.totalUsers || 0}</p>
            </div>

            <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Active Tasks</h3>
                <p className="text-3xl font-semibold text-white">{stats?.activeTasks || 0}</p>
            </div>

            <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Departments</h3>
                <p className="text-3xl font-semibold text-white">{stats?.totalDepartments || 0}</p>
            </div>

            <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Storage Used</h3>
                <p className="text-3xl font-semibold text-white">{stats?.storageUsed || '0 MB'}</p>
            </div>
        </div>
    );
} 