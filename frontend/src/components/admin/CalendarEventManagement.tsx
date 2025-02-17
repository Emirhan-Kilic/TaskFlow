import { useState } from 'react';
import { CalendarEvent, User, Task } from '@/types/database';
import { Dialog } from '@headlessui/react';
import { formatDate } from '@/utils/formatters';

interface Props {
    events: CalendarEvent[];
    users: User[];
    tasks: Task[];
    onEdit: (event: CalendarEvent) => Promise<void>;
    onDelete: (eventId: bigint) => Promise<void>;
    onCreate: (event: Omit<CalendarEvent, 'id' | 'created_at'>) => Promise<void>;
}

export function CalendarEventManagement({
    events,
    users,
    tasks,
    onEdit,
    onDelete,
    onCreate
}: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium text-white">Calendar Events</h2>
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors duration-300"
                >
                    Create Event
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-300">
                    <thead className="text-sm text-slate-400">
                        <tr>
                            <th className="px-4 py-2">Task</th>
                            <th className="px-4 py-2">User</th>
                            <th className="px-4 py-2">Start Time</th>
                            <th className="px-4 py-2">End Time</th>
                            <th className="px-4 py-2">Service</th>
                            <th className="px-4 py-2">Last Synced</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map(event => (
                            <tr key={String(event.id)} className="border-t border-slate-700/50">
                                <td className="px-4 py-3">
                                    {tasks.find(t => t.id === event.task_id)?.title}
                                </td>
                                <td className="px-4 py-3">
                                    {users.find(u => u.id === event.user_id)?.display_name}
                                </td>
                                <td className="px-4 py-3">
                                    {formatDate(event.start_time)}
                                </td>
                                <td className="px-4 py-3">
                                    {formatDate(event.end_time)}
                                </td>
                                <td className="px-4 py-3">{event.service_type}</td>
                                <td className="px-4 py-3">
                                    {event.last_synced ? formatDate(event.last_synced) : 'Never'}
                                </td>
                                <td className="px-4 py-3 space-x-2">
                                    <button
                                        onClick={() => {
                                            setSelectedEvent(event);
                                            setIsEditing(true);
                                        }}
                                        className="text-blue-400 hover:text-blue-300"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => onDelete(event.id)}
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

            {/* Edit Event Dialog */}
            <Dialog
                open={isEditing}
                onClose={() => setIsEditing(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Edit Calendar Event
                        </Dialog.Title>
                        {selectedEvent && (
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                await onEdit(selectedEvent);
                                setIsEditing(false);
                            }}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Task
                                        </label>
                                        <select
                                            value={String(selectedEvent.task_id)}
                                            onChange={(e) => setSelectedEvent({
                                                ...selectedEvent,
                                                task_id: BigInt(e.target.value)
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        >
                                            {tasks.map(task => (
                                                <option key={String(task.id)} value={String(task.id)}>
                                                    {task.title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            User
                                        </label>
                                        <select
                                            value={String(selectedEvent.user_id)}
                                            onChange={(e) => setSelectedEvent({
                                                ...selectedEvent,
                                                user_id: BigInt(e.target.value)
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        >
                                            {users.map(user => (
                                                <option key={String(user.id)} value={String(user.id)}>
                                                    {user.display_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Start Time
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={selectedEvent.start_time.slice(0, 16)}
                                            onChange={(e) => setSelectedEvent({
                                                ...selectedEvent,
                                                start_time: new Date(e.target.value).toISOString()
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            End Time
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={selectedEvent.end_time.slice(0, 16)}
                                            onChange={(e) => setSelectedEvent({
                                                ...selectedEvent,
                                                end_time: new Date(e.target.value).toISOString()
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            Service Type
                                        </label>
                                        <input
                                            type="text"
                                            value={selectedEvent.service_type}
                                            onChange={(e) => setSelectedEvent({
                                                ...selectedEvent,
                                                service_type: e.target.value
                                            })}
                                            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                            required
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

            {/* Create Event Dialog */}
            <Dialog
                open={isCreating}
                onClose={() => setIsCreating(false)}
                className="relative z-50"
            >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
                        <Dialog.Title className="text-xl font-medium text-white mb-4">
                            Create Calendar Event
                        </Dialog.Title>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            await onCreate({
                                task_id: BigInt(formData.get('task_id') as string),
                                user_id: BigInt(formData.get('user_id') as string),
                                external_id: formData.get('external_id') as string,
                                start_time: new Date(formData.get('start_time') as string).toISOString(),
                                end_time: new Date(formData.get('end_time') as string).toISOString(),
                                service_type: formData.get('service_type') as string,
                                sync_token: null,
                                last_synced: null
                            });
                            setIsCreating(false);
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
                                        External ID
                                    </label>
                                    <input
                                        type="text"
                                        name="external_id"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Start Time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        name="start_time"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        End Time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        name="end_time"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Service Type
                                    </label>
                                    <input
                                        type="text"
                                        name="service_type"
                                        className="w-full px-3 py-2 bg-slate-700 rounded-lg text-white"
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
                                        Create Event
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