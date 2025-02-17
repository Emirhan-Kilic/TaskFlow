import { useState } from 'react';
import { TaskAttachment, User, Task } from '@/types/database';
import { Dialog } from '@headlessui/react';
import { formatFileSize, formatDate } from '@/utils/formatters';

interface Props {
    attachments: TaskAttachment[];
    tasks: Task[];
    users: User[];
    onDelete: (attachmentId: bigint) => Promise<void>;
    onUpload: (attachment: Omit<TaskAttachment, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}

export function TaskAttachmentManagement({
    attachments,
    tasks,
    users,
    onDelete,
    onUpload
}: Props) {
    const [isUploading, setIsUploading] = useState(false);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-white">Task Attachments</h2>
                <button
                    onClick={() => setIsUploading(true)}
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                >
                    Upload Attachment
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-300">
                    <thead className="text-sm text-slate-400">
                        <tr>
                            <th className="px-4 py-2">Task</th>
                            <th className="px-4 py-2">File Name</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-4 py-2">Size</th>
                            <th className="px-4 py-2">Upload Date</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {attachments.map(attachment => (
                            <tr key={String(attachment.id)} className="border-t border-slate-700/50">
                                <td className="px-4 py-3">
                                    {tasks.find(t => t.id === attachment.task_id)?.title}
                                </td>
                                <td className="px-4 py-3">{attachment.file_name}</td>
                                <td className="px-4 py-3">{attachment.file_type}</td>
                                <td className="px-4 py-3">{formatFileSize(attachment.file_size)}</td>
                                <td className="px-4 py-3">
                                    {formatDate(attachment.created_at)}
                                </td>
                                <td className="px-4 py-3 space-x-2">
                                    <a
                                        href={attachment.file_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300"
                                    >
                                        Download
                                    </a>
                                    <button
                                        onClick={() => onDelete(attachment.id)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Upload Attachment Dialog */}
            <Dialog
                open={isUploading}
                onClose={() => setIsUploading(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Upload Attachment
                        </Dialog.Title>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            const file = formData.get('file') as File;
                            
                            await onUpload({
                                task_id: BigInt(formData.get('task_id') as string),
                                file_name: file.name,
                                file_url: URL.createObjectURL(file), // This should be handled by your file upload service
                                file_type: file.type,
                                file_size: file.size
                            });
                            setIsUploading(false);
                        }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Task
                                    </label>
                                    <select
                                        name="task_id"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    >
                                        <option value="">Select Task</option>
                                        {tasks.map(task => (
                                            <option key={String(task.id)} value={String(task.id)}>
                                                {task.title}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        File
                                    </label>
                                    <input
                                        type="file"
                                        name="file"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    />
                                </div>
                                <div className="flex justify-end space-x-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => setIsUploading(false)}
                                        className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                                    >
                                        Upload
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