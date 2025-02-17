import { useState } from 'react';
import { Task, Department, User } from '@/types/database';
import { Dialog } from '@headlessui/react';
import { formatDate } from '@/utils/formatters';

interface Props {
    tasks: Task[];
    departments: Department[];
    users: User[];
    onEdit: (task: Task) => Promise<void>;
    onCreate: (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}

export function TaskManagement({ tasks, departments, users, onEdit, onCreate }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-white">Task Management</h2>
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                >
                    Create Task
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-300">
                    <thead className="text-sm text-slate-400">
                        <tr>
                            <th className="px-4 py-2">Title</th>
                            <th className="px-4 py-2">Department</th>
                            <th className="px-4 py-2">Priority</th>
                            <th className="px-4 py-2">Due Date</th>
                            <th className="px-4 py-2">Created By</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map(task => (
                            <tr key={task.id} className="border-t border-slate-700/50">
                                <td className="px-4 py-3">{task.title}</td>
                                <td className="px-4 py-3">
                                    {departments.find(d => d.id === task.department_id)?.name}
                                </td>
                                <td className="px-4 py-3">{task.priority}</td>
                                <td className="px-4 py-3">{formatDate(task.due_date)}</td>
                                <td className="px-4 py-3">
                                    {users.find(u => u.id === task.created_by)?.display_name}
                                </td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => {
                                            setSelectedTask(task);
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

            {/* Edit Task Dialog */}
            <Dialog
                open={isEditing}
                onClose={() => setIsEditing(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Edit Task
                        </Dialog.Title>
                        {selectedTask && (
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                await onEdit(selectedTask);
                                setIsEditing(false);
                            }}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Title
                                        </label>
                                        <input
                                            type="text"
                                            value={selectedTask.title}
                                            onChange={(e) => setSelectedTask({
                                                ...selectedTask,
                                                title: e.target.value
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Description
                                        </label>
                                        <textarea
                                            value={selectedTask.description || ''}
                                            onChange={(e) => setSelectedTask({
                                                ...selectedTask,
                                                description: e.target.value
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white h-24"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Department
                                        </label>
                                        <select
                                            value={String(selectedTask.department_id)}
                                            onChange={(e) => setSelectedTask({
                                                ...selectedTask,
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
                                            Priority
                                        </label>
                                        <select
                                            value={selectedTask.priority}
                                            onChange={(e) => setSelectedTask({
                                                ...selectedTask,
                                                priority: e.target.value as Task['priority']
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        >
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                            <option value="Critical">Critical</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Due Date
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={selectedTask.due_date?.slice(0, 16) || ''}
                                            onChange={(e) => setSelectedTask({
                                                ...selectedTask,
                                                due_date: e.target.value ? new Date(e.target.value).toISOString() : null
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
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

            {/* Create Task Dialog */}
            <Dialog
                open={isCreating}
                onClose={() => setIsCreating(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Create New Task
                        </Dialog.Title>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            await onCreate({
                                title: formData.get('title') as string,
                                description: formData.get('description') as string,
                                department_id: BigInt(formData.get('department_id') as string),
                                created_by: BigInt(users[0].id), // Current user's ID
                                priority: formData.get('priority') as Task['priority'],
                                due_date: formData.get('due_date') ? new Date(formData.get('due_date') as string).toISOString() : null,
                                start_date: null,
                                version: 1,
                                template_id: null
                            });
                            setIsCreating(false);
                        }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Title
                                    </label>
                                    <input
                                        type="text"
                                        name="title"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    />
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
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Department
                                    </label>
                                    <select
                                        name="department_id"
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
                                        Priority
                                    </label>
                                    <select
                                        name="priority"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                        <option value="Critical">Critical</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Due Date
                                    </label>
                                    <input
                                        type="datetime-local"
                                        name="due_date"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
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
                                        Create Task
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