import { useState } from 'react';
import { Notification, User, Task } from '@/types/database';
import { Dialog } from '@headlessui/react';
import { formatDate } from '@/utils/formatters';

interface Props {
    notifications: Notification[];
    users: User[];
    tasks: Task[];
    onMarkAsRead: (notification: Notification) => Promise<void>;
    onDelete: (notificationId: bigint) => Promise<void>;
    onSendNew: (notification: Omit<Notification, 'id' | 'created_at' | 'is_read'>) => Promise<void>;
}

export function NotificationManagement({
    notifications,
    users,
    tasks,
    onMarkAsRead,
    onDelete,
    onSendNew
}: Props) {
    const [isCreating, setIsCreating] = useState(false);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-white">Notifications</h2>
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                >
                    Send New Notification
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-300">
                    <thead className="text-sm text-slate-400">
                        <tr>
                            <th className="px-4 py-2">User</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-4 py-2">Subject</th>
                            <th className="px-4 py-2">Related Task</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Sent At</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {notifications.map(notification => (
                            <tr key={String(notification.id)} className="border-t border-slate-700/50">
                                <td className="px-4 py-3">
                                    {users.find(u => u.id === notification.user_id)?.display_name}
                                </td>
                                <td className="px-4 py-3">{notification.type}</td>
                                <td className="px-4 py-3">{notification.subject}</td>
                                <td className="px-4 py-3">
                                    {notification.task_id ? 
                                        tasks.find(t => t.id === notification.task_id)?.title :
                                        'N/A'
                                    }
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs ${
                                        notification.is_read ? 
                                        'bg-green-500/20 text-green-400' : 
                                        'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                        {notification.is_read ? 'Read' : 'Unread'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    {formatDate(notification.created_at)}
                                </td>
                                <td className="px-4 py-3 space-x-2">
                                    {!notification.is_read && (
                                        <button
                                            onClick={() => onMarkAsRead(notification)}
                                            className="text-green-400 hover:text-green-300"
                                        >
                                            Mark as Read
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onDelete(notification.id)}
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

            {/* Send New Notification Dialog */}
            <Dialog
                open={isCreating}
                onClose={() => setIsCreating(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Send New Notification
                        </Dialog.Title>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            await onSendNew({
                                user_id: BigInt(formData.get('user_id') as string),
                                task_id: formData.get('task_id') ? BigInt(formData.get('task_id') as string) : null,
                                type: formData.get('type') as Notification['type'],
                                subject: formData.get('subject') as string,
                                message: formData.get('message') as string
                            });
                            setIsCreating(false);
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
                                        Related Task (Optional)
                                    </label>
                                    <select
                                        name="task_id"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                    >
                                        <option value="">None</option>
                                        {tasks.map(task => (
                                            <option key={String(task.id)} value={String(task.id)}>
                                                {task.title}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Type
                                    </label>
                                    <select
                                        name="type"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    >
                                        <option value="email">Email</option>
                                        <option value="sms">SMS</option>
                                        <option value="push">Push</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Subject
                                    </label>
                                    <input
                                        type="text"
                                        name="subject"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Message
                                    </label>
                                    <textarea
                                        name="message"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white h-24"
                                        required
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
                                        Send Notification
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