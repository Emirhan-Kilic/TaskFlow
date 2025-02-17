import { useState } from 'react';
import { TaskTemplate, Department, User } from '@/types/database';
import { Dialog } from '@headlessui/react';

interface Props {
    templates: TaskTemplate[];
    departments: Department[];
    users: User[];
    onEdit: (template: TaskTemplate) => Promise<void>;
    onCreate: (template: Omit<TaskTemplate, 'id' | 'created_at'>) => Promise<void>;
}

export function TemplateManagement({ templates, departments, users, onEdit, onCreate }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-white">Task Templates</h2>
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                >
                    Create Template
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-300">
                    <thead className="text-sm text-slate-400">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Department</th>
                            <th className="px-4 py-2">Priority</th>
                            <th className="px-4 py-2">Est. Duration</th>
                            <th className="px-4 py-2">Created By</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {templates.map(template => (
                            <tr key={String(template.id)} className="border-t border-slate-700/50">
                                <td className="px-4 py-3">{template.name}</td>
                                <td className="px-4 py-3">
                                    {departments.find(d => d.id === template.department_id)?.name}
                                </td>
                                <td className="px-4 py-3">{template.default_priority}</td>
                                <td className="px-4 py-3">{template.estimated_duration}</td>
                                <td className="px-4 py-3">
                                    {users.find(u => u.id === template.created_by)?.display_name}
                                </td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => {
                                            setSelectedTemplate(template);
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

            {/* Edit Template Dialog */}
            <Dialog
                open={isEditing}
                onClose={() => setIsEditing(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Edit Template
                        </Dialog.Title>
                        {selectedTemplate && (
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                await onEdit(selectedTemplate);
                                setIsEditing(false);
                            }}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Template Name
                                        </label>
                                        <input
                                            type="text"
                                            value={selectedTemplate.name}
                                            onChange={(e) => setSelectedTemplate({
                                                ...selectedTemplate,
                                                name: e.target.value
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
                                            value={selectedTemplate.description || ''}
                                            onChange={(e) => setSelectedTemplate({
                                                ...selectedTemplate,
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
                                            value={String(selectedTemplate.department_id)}
                                            onChange={(e) => setSelectedTemplate({
                                                ...selectedTemplate,
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
                                            Default Priority
                                        </label>
                                        <select
                                            value={selectedTemplate.default_priority}
                                            onChange={(e) => setSelectedTemplate({
                                                ...selectedTemplate,
                                                default_priority: e.target.value as TaskTemplate['default_priority']
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
                                            Estimated Duration (hours)
                                        </label>
                                        <input
                                            type="number"
                                            value={selectedTemplate.estimated_duration || ''}
                                            onChange={(e) => setSelectedTemplate({
                                                ...selectedTemplate,
                                                estimated_duration: e.target.value
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            min="0"
                                            step="0.5"
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

            {/* Create Template Dialog */}
            <Dialog
                open={isCreating}
                onClose={() => setIsCreating(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Create New Template
                        </Dialog.Title>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            await onCreate({
                                name: formData.get('name') as string,
                                description: formData.get('description') as string,
                                department_id: BigInt(formData.get('department_id') as string),
                                created_by: BigInt(users[0].id), // Current user's ID
                                default_priority: formData.get('default_priority') as TaskTemplate['default_priority'],
                                estimated_duration: formData.get('estimated_duration') as string
                            });
                            setIsCreating(false);
                        }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Template Name
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
                                        Default Priority
                                    </label>
                                    <select
                                        name="default_priority"
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
                                        Estimated Duration (hours)
                                    </label>
                                    <input
                                        type="number"
                                        name="estimated_duration"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        min="0"
                                        step="0.5"
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
                                        Create Template
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