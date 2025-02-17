import { useState } from 'react';
import { User, Department } from '@/types/database';
import { Dialog } from '@headlessui/react';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';

interface Props {
    users: User[];
    departments: Department[];
    onEdit: (user: User) => Promise<void>;
    onCreate: (user: Omit<User, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}

export function UserManagement({ users, departments, onEdit, onCreate }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [newUser, setNewUser] = useState({
        email: '',
        role: 'personnel' as const,
        department_id: null as bigint | null,
        display_name: '',
        job_title: '',
        profile_picture: null
    });

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-white">User Management</h2>
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                >
                    Create User
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-300">
                    <thead className="text-sm text-slate-400">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Email</th>
                            <th className="px-4 py-2">Role</th>
                            <th className="px-4 py-2">Department</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-t border-slate-700/50">
                                <td className="px-4 py-3">{user.display_name}</td>
                                <td className="px-4 py-3">{user.email}</td>
                                <td className="px-4 py-3">{user.role}</td>
                                <td className="px-4 py-3">
                                    {departments.find(d => d.id === user.department_id)?.name}
                                </td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => {
                                            setSelectedUser(user);
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

            {/* Edit User Dialog */}
            <Dialog
                open={isEditing}
                onClose={() => setIsEditing(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Edit User
                        </Dialog.Title>
                        {selectedUser && (
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                await onEdit(selectedUser);
                                setIsEditing(false);
                            }}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Display Name
                                        </label>
                                        <input
                                            type="text"
                                            value={selectedUser.display_name || ''}
                                            onChange={(e) => setSelectedUser({
                                                ...selectedUser,
                                                display_name: e.target.value
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        />
                                    </div>
                                    {/* Add other fields similar to above */}
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

            {/* Create User Dialog */}
            <Dialog
                open={isCreating}
                onClose={() => setIsCreating(false)}
                className="relative z-50"
            >
                {/* Similar structure to Edit Dialog */}
            </Dialog>
        </div>
    );
} 