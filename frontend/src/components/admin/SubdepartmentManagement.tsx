import { useState } from 'react';
import { Subdepartment, Department, User, SubdepartmentParticipation } from '@/types/database';
import { Dialog } from '@headlessui/react';

interface Props {
    subdepartments: Subdepartment[];
    departments: Department[];
    users: User[];
    participations: SubdepartmentParticipation[];
    onEdit: (subdepartment: Subdepartment) => Promise<void>;
    onCreate: (subdepartment: Omit<Subdepartment, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
    onAddMember: (participation: Omit<SubdepartmentParticipation, 'id' | 'joined_at'>) => Promise<void>;
}

export function SubdepartmentManagement({
    subdepartments,
    departments,
    users,
    participations,
    onEdit,
    onCreate,
    onAddMember
}: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isAddingMember, setIsAddingMember] = useState(false);
    const [selectedSubdepartment, setSelectedSubdepartment] = useState<Subdepartment | null>(null);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-white">Subdepartments</h2>
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                >
                    Create Subdepartment
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-300">
                    <thead className="text-sm text-slate-400">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Parent Department</th>
                            <th className="px-4 py-2">Manager</th>
                            <th className="px-4 py-2">Members</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subdepartments.map(subdept => (
                            <tr key={String(subdept.id)} className="border-t border-slate-700/50">
                                <td className="px-4 py-3">{subdept.name}</td>
                                <td className="px-4 py-3">
                                    {departments.find(d => d.id === subdept.department_id)?.name}
                                </td>
                                <td className="px-4 py-3">
                                    {users.find(u => u.id === subdept.manager_id)?.display_name}
                                </td>
                                <td className="px-4 py-3">
                                    {participations.filter(p => p.subdepartment_id === subdept.id).length}
                                </td>
                                <td className="px-4 py-3 space-x-2">
                                    <button
                                        onClick={() => {
                                            setSelectedSubdepartment(subdept);
                                            setIsEditing(true);
                                        }}
                                        className="text-blue-400 hover:text-blue-300"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedSubdepartment(subdept);
                                            setIsAddingMember(true);
                                        }}
                                        className="text-green-400 hover:text-green-300"
                                    >
                                        Add Member
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Subdepartment Dialog */}
            <Dialog
                open={isEditing}
                onClose={() => setIsEditing(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Edit Subdepartment
                        </Dialog.Title>
                        {selectedSubdepartment && (
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                await onEdit(selectedSubdepartment);
                                setIsEditing(false);
                            }}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Name
                                        </label>
                                        <input
                                            type="text"
                                            value={selectedSubdepartment.name}
                                            onChange={(e) => setSelectedSubdepartment({
                                                ...selectedSubdepartment,
                                                name: e.target.value
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Parent Department
                                        </label>
                                        <select
                                            value={String(selectedSubdepartment.department_id)}
                                            onChange={(e) => setSelectedSubdepartment({
                                                ...selectedSubdepartment,
                                                department_id: BigInt(e.target.value)
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        >
                                            {departments.map(dept => (
                                                <option key={String(dept.id)} value={String(dept.id)}>
                                                    {dept.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Manager
                                        </label>
                                        <select
                                            value={String(selectedSubdepartment.manager_id || '')}
                                            onChange={(e) => setSelectedSubdepartment({
                                                ...selectedSubdepartment,
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
                                            value={selectedSubdepartment.description || ''}
                                            onChange={(e) => setSelectedSubdepartment({
                                                ...selectedSubdepartment,
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

            {/* Create Subdepartment Dialog */}
            <Dialog
                open={isCreating}
                onClose={() => setIsCreating(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Create Subdepartment
                        </Dialog.Title>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            await onCreate({
                                name: formData.get('name') as string,
                                department_id: BigInt(formData.get('department_id') as string),
                                manager_id: formData.get('manager_id') ? BigInt(formData.get('manager_id') as string) : null,
                                employee_count: 0,
                                description: formData.get('description') as string
                            });
                            setIsCreating(false);
                        }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Name
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
                                        Parent Department
                                    </label>
                                    <select
                                        name="department_id"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    >
                                        <option value="">Select Department</option>
                                        {departments.map(dept => (
                                            <option key={String(dept.id)} value={String(dept.id)}>
                                                {dept.name}
                                            </option>
                                        ))}
                                    </select>
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
                                        Create Subdepartment
                                    </button>
                                </div>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </Dialog>

            {/* Add Member Dialog */}
            <Dialog
                open={isAddingMember}
                onClose={() => setIsAddingMember(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Add Member to {selectedSubdepartment?.name}
                        </Dialog.Title>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!selectedSubdepartment) return;
                            
                            const formData = new FormData(e.currentTarget);
                            await onAddMember({
                                subdepartment_id: selectedSubdepartment.id,
                                user_id: BigInt(formData.get('user_id') as string),
                                role: formData.get('role') as string
                            });
                            setIsAddingMember(false);
                        }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        User
                                    </label>
                                    <select
                                        name="user_id"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    >
                                        <option value="">Select User</option>
                                        {users.map(user => (
                                            <option key={String(user.id)} value={String(user.id)}>
                                                {user.display_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Role
                                    </label>
                                    <input
                                        type="text"
                                        name="role"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    />
                                </div>
                                <div className="flex justify-end space-x-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingMember(false)}
                                        className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                                    >
                                        Add Member
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