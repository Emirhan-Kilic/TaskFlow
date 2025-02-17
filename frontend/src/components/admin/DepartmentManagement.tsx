import { useState } from 'react';
import { Department, User } from '@/types/database';
import { Dialog } from '@headlessui/react';

interface Props {
    departments: Department[];
    users: User[];
    onEdit: (department: Department) => Promise<void>;
    onCreate: (department: Omit<Department, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}

export function DepartmentManagement({ departments, users, onEdit, onCreate }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-white">Department Management</h2>
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                >
                    Create Department
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-300">
                    <thead className="text-sm text-slate-400">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Manager</th>
                            <th className="px-4 py-2">Employees</th>
                            <th className="px-4 py-2">Description</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {departments.map(department => (
                            <tr key={String(department.id)} className="border-t border-slate-700/50">
                                <td className="px-4 py-3">{department.name}</td>
                                <td className="px-4 py-3">
                                    {users.find(u => u.id === department.manager_id)?.display_name || 'No Manager'}
                                </td>
                                <td className="px-4 py-3">{department.employee_count}</td>
                                <td className="px-4 py-3">{department.description || 'No description'}</td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => {
                                            setSelectedDepartment(department);
                                            setIsEditing(true);
                                        }}
                                        className="text-blue-400 hover:text-blue-300"
                                    >
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Department Dialog */}
            <Dialog
                open={isEditing}
                onClose={() => setIsEditing(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Edit Department
                        </Dialog.Title>
                        {selectedDepartment && (
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                await onEdit(selectedDepartment);
                                setIsEditing(false);
                            }}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Department Name
                                        </label>
                                        <input
                                            type="text"
                                            value={selectedDepartment.name}
                                            onChange={(e) => setSelectedDepartment({
                                                ...selectedDepartment,
                                                name: e.target.value
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Manager
                                        </label>
                                        <select
                                            value={String(selectedDepartment.manager_id || '')}
                                            onChange={(e) => setSelectedDepartment({
                                                ...selectedDepartment,
                                                manager_id: e.target.value ? BigInt(e.target.value) : null
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        >
                                            <option value="">No Manager</option>
                                            {users.filter(u => u.role === 'manager').map(manager => (
                                                <option key={String(manager.id)} value={String(manager.id)}>
                                                    {manager.display_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Description
                                        </label>
                                        <textarea
                                            value={selectedDepartment.description || ''}
                                            onChange={(e) => setSelectedDepartment({
                                                ...selectedDepartment,
                                                description: e.target.value
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white h-24"
                                        />
                                    </div>
                                    <div className="flex justify-end space-x-3 mt-6">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditing(false)}
                                            className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </Dialog.Panel>
                </div>
            </Dialog>

            {/* Create Department Dialog */}
            <Dialog
                open={isCreating}
                onClose={() => setIsCreating(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Create Department
                        </Dialog.Title>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            await onCreate({
                                name: formData.get('name') as string,
                                manager_id: formData.get('manager_id') ? BigInt(formData.get('manager_id') as string) : null,
                                employee_count: 0,
                                description: formData.get('description') as string
                            });
                            setIsCreating(false);
                        }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Department Name
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Manager
                                    </label>
                                    <select
                                        name="manager_id"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                    >
                                        <option value="">No Manager</option>
                                        {users.filter(u => u.role === 'manager').map(manager => (
                                            <option key={String(manager.id)} value={String(manager.id)}>
                                                {manager.display_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        name="description"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white h-24"
                                    />
                                </div>
                                <div className="flex justify-end space-x-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreating(false)}
                                        className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                                    >
                                        Create Department
                                    </button>
                                </div>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </div>
    );
} 