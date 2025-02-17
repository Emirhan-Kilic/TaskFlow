'use client';

import { Dialog } from '@headlessui/react';
import { useState, useRef, useEffect } from 'react';
import { Task, User } from '@/types/database';
import { motion, AnimatePresence } from 'framer-motion';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import toast from 'react-hot-toast';
import { supabase } from '@/app/supabaseClient';

interface EditTaskFormData {
    title: string;
    description: string | null;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    start_date: string | null;
    due_date: string | null;
    assignees: string[];
    attachments: FormData[];
    removed_attachments: bigint[];
    comments: string | null;
}

interface EditTaskFormProps {
    task: Task;
    isOpen: boolean;
    onClose: () => void;
    teamMembers: User[];
    onSubmit: (taskId: bigint, data: EditTaskFormData) => Promise<void>;
}

interface DraggableUserProps {
    user: User;
    moveUser: (fromList: string, toList: string, userId: string) => void;
    listType: 'available' | 'assigned';
}

const DraggableUser = ({ user, moveUser, listType }: DraggableUserProps) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'USER',
        item: { userId: user.id.toString(), fromList: listType },
        collect: (monitor) => ({
            isDragging: monitor.isDragging()
        })
    }));

    return (
        <div
            ref={drag}
            className={`p-3 bg-slate-700/50 rounded-lg flex items-center space-x-3 cursor-move
                ${isDragging ? 'opacity-50' : 'opacity-100'}
                hover:bg-slate-600/50 transition-colors`}
        >
            <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                <span className="text-blue-300 text-sm">
                    {user.display_name.split(' ').map(n => n[0]).join('')}
                </span>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-white truncate">{user.display_name}</p>
                <p className="text-slate-400 text-sm truncate">{user.job_title}</p>
            </div>
        </div>
    );
};

interface UserListProps {
    title: string;
    users: User[];
    listType: 'available' | 'assigned';
    moveUser: (fromList: string, toList: string, userId: string) => void;
}

const UserList = ({ title, users, listType, moveUser }: UserListProps) => {
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'USER',
        drop: (item: { userId: string; fromList: string }) => {
            if (item.fromList !== listType) {
                moveUser(item.fromList, listType, item.userId);
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver()
        })
    }));

    return (
        <div
            ref={drop}
            className={`flex-1 p-4 bg-slate-800/50 rounded-lg border ${isOver ? 'border-blue-500/50' : 'border-slate-700/50'
                }`}
        >
            <h3 className="text-sm font-medium text-slate-300 mb-3">{title}</h3>
            <div className="space-y-2">
                {users.map(user => (
                    <DraggableUser
                        key={user.id}
                        user={user}
                        moveUser={moveUser}
                        listType={listType}
                    />
                ))}
            </div>
        </div>
    );
};

interface FileAttachment {
    file: File;
    previewUrl?: string;
}

interface TaskAttachment {
    id: bigint;
    task_id: bigint;
    file_name: string;
    file_path: string;
    file_url: string;
    file_type: string;
    file_size: number;
    uploaded_at: string;
}

export default function EditTaskForm({ task, isOpen, onClose, teamMembers, onSubmit }: EditTaskFormProps) {
    const [formData, setFormData] = useState<EditTaskFormData>({
        title: task.title,
        description: task.description,
        priority: task.priority,
        start_date: task.start_date,
        due_date: task.due_date,
        assignees: task.task_assignments?.map(ta => ta.assigned_to.id.toString()) || [],
        attachments: [],
        removed_attachments: [],
        comments: task.task_assignments[0]?.comments || null
    });

    const [availableUsers, setAvailableUsers] = useState<User[]>(() =>
        teamMembers.filter(member => !formData.assignees.includes(member.id.toString()))
    );
    const [assignedUsers, setAssignedUsers] = useState<User[]>(() =>
        teamMembers.filter(member => formData.assignees.includes(member.id.toString()))
    );

    const [attachments, setAttachments] = useState<FileAttachment[]>([]);
    const [existingAttachments, setExistingAttachments] = useState<TaskAttachment[]>([]);
    const [isLoadingAttachments, setIsLoadingAttachments] = useState(true);
    const [removedAttachmentIds, setRemovedAttachmentIds] = useState<bigint[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const moveUser = (fromList: string, toList: string, userId: string) => {
        const user = teamMembers.find(u => u.id.toString() === userId);
        if (!user) return;

        if (fromList === 'available' && toList === 'assigned') {
            setAvailableUsers(prev => prev.filter(u => u.id.toString() !== userId));
            setAssignedUsers(prev => [...prev, user]);
            setFormData(prev => ({
                ...prev,
                assignees: [...prev.assignees, userId]
            }));
        } else if (fromList === 'assigned' && toList === 'available') {
            setAssignedUsers(prev => prev.filter(u => u.id.toString() !== userId));
            setAvailableUsers(prev => [...prev, user]);
            setFormData(prev => ({
                ...prev,
                assignees: prev.assignees.filter(id => id !== userId)
            }));
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const newAttachments: FileAttachment[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const previewUrl = file.type.startsWith('image/')
                ? URL.createObjectURL(file)
                : undefined;

            newAttachments.push({ file, previewUrl });
        }

        setAttachments([...attachments, ...newAttachments]);
    };

    const removeAttachment = (index: number) => {
        const newAttachments = [...attachments];
        if (newAttachments[index].previewUrl) {
            URL.revokeObjectURL(newAttachments[index].previewUrl!);
        }
        newAttachments.splice(index, 1);
        setAttachments(newAttachments);
    };

    const removeExistingAttachment = async (attachmentId: bigint) => {
        try {
            // First remove from storage
            const attachmentToRemove = existingAttachments.find(att => att.id === attachmentId);
            if (!attachmentToRemove) return;

            const { error: storageError } = await supabase
                .storage
                .from('task-attachments')
                .remove([attachmentToRemove.file_path]);

            if (storageError) throw storageError;

            // Then remove from database using backend API
            const response = await fetch(`/api/task-attachments/${attachmentId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete attachment');
            }

            // Update local state
            setExistingAttachments(prev => prev.filter(att => att.id !== attachmentId));
            setRemovedAttachmentIds(prev => [...prev, attachmentId]);

            toast.success('Attachment removed successfully');
        } catch (error) {
            console.error('Error removing attachment:', error);
            toast.error('Failed to remove attachment');
        }
    };

    const handleDownload = async (attachment: TaskAttachment) => {
        try {
            const response = await fetch(`/api/task-attachments/${attachment.id}/download`);
            if (!response.ok) throw new Error('Failed to get download URL');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = attachment.file_name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error downloading file:', error);
            toast.error('Failed to download file');
        }
    };

    useEffect(() => {
        const fetchAttachments = async () => {
            try {
                setIsLoadingAttachments(true);
                const response = await fetch(`/api/task-attachments?task_id=${task.id}`);
                if (!response.ok) throw new Error('Failed to fetch attachments');

                const attachments = await response.json();
                setExistingAttachments(attachments);
            } catch (error) {
                console.error('Error in fetchAttachments:', error);
                toast.error('Failed to load existing attachments');
            } finally {
                setIsLoadingAttachments(false);
            }
        };

        if (isOpen && task.id) {
            fetchAttachments();
        }
    }, [isOpen, task.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsUploading(true);

        try {
            // Upload new attachments
            const uploadPromises = attachments.map(async (attachment) => {
                const file = attachment.file;
                const fileExt = file.name.split('.').pop();
                const fileName = `${task.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

                // Upload file to storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('task-attachments')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) throw uploadError;

                // Create attachment record using backend API
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch(`/api/task-attachments/task/${task.id}`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    // Clean up uploaded file
                    await supabase.storage
                        .from('task-attachments')
                        .remove([uploadData.path]);
                    throw new Error('Failed to create attachment record');
                }

                return await response.json();
            });

            await Promise.all(uploadPromises);

            // Update task with removed attachments
            if (removedAttachmentIds.length > 0) {
                await fetch(`/api/task-attachments/${task.id}/update`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        removed_attachments: removedAttachmentIds
                    })
                });
            }

            // Submit the rest of the form data
            await onSubmit(task.id, {
                ...formData,
                attachments: [],
                removed_attachments: removedAttachmentIds
            });

            onClose();
            toast.success('Task updated successfully');
        } catch (error) {
            console.error('Error in form submission:', error);
            toast.error('Failed to update task');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
            {/* Enhanced backdrop with padding */}
            <div className="fixed inset-0" aria-hidden="true">
                <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"></div>
                <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10"></div>
                    <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-float-slow"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float-slower"></div>
                </div>
            </div>

            {/* Scrollable container with padding */}
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-8">
                    <Dialog.Panel className="mx-auto max-w-3xl w-full relative">
                        {/* Header - Fixed at top */}
                        <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 rounded-t-xl sticky top-0 z-10">
                            <div className="px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <Dialog.Title className="text-2xl font-light text-white">
                                        Update Task
                                    </Dialog.Title>
                                </div>
                            </div>
                        </header>

                        {/* Scrollable form content */}
                        <div className="bg-slate-800/50 backdrop-blur-xl rounded-b-xl">
                            <AnimatePresence mode="wait">
                                <motion.form
                                    key="edit-task-form"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="p-6"
                                    onSubmit={handleSubmit}
                                >
                                    <div className="space-y-6">
                                        {/* Read-only title */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Title
                                            </label>
                                            <div className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white">
                                                {task.title}
                                            </div>
                                        </div>

                                        {/* Editable description */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Description
                                            </label>
                                            <textarea
                                                value={formData.description || ''}
                                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white min-h-[120px] resize-y"
                                                placeholder="Add or update task description..."
                                            />
                                        </div>

                                        {/* Status update */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Status
                                            </label>
                                            <select
                                                value={task.task_assignments[0]?.status || 'To Do'}
                                                onChange={(e) => {
                                                    onStatusChange(task.id, e.target.value);
                                                }}
                                                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                                            >
                                                <option value="To Do">To Do</option>
                                                <option value="In Progress">In Progress</option>
                                                <option value="Under Review">Under Review</option>
                                                <option value="Completed">Completed</option>
                                            </select>
                                        </div>

                                        {/* Comments section */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Comments
                                            </label>
                                            <textarea
                                                value={formData.comments || ''}
                                                onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
                                                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white min-h-[80px] resize-y"
                                                placeholder="Add your comments..."
                                            />
                                        </div>

                                        {/* Keep attachments section for viewing and downloading */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-4">
                                                Attachments
                                            </label>
                                            <div className="space-y-4">
                                                {/* File Drop Zone */}
                                                <div
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="border-2 border-dashed border-slate-700/50 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500/50 transition-colors"
                                                >
                                                    <input
                                                        type="file"
                                                        ref={fileInputRef}
                                                        onChange={handleFileSelect}
                                                        multiple
                                                        className="hidden"
                                                    />
                                                    <div className="text-slate-400">
                                                        <svg className="mx-auto h-12 w-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                        </svg>
                                                        <p className="text-sm">
                                                            Drag and drop files here, or <span className="text-blue-400">browse</span>
                                                        </p>
                                                        <p className="text-xs mt-2">
                                                            Supported files: Images, PDFs, Documents
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Loading State */}
                                                {isLoadingAttachments && (
                                                    <div className="text-center py-4">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                                        <p className="text-slate-400 mt-2">Loading attachments...</p>
                                                    </div>
                                                )}

                                                {/* Existing Attachments */}
                                                {!isLoadingAttachments && existingAttachments.length > 0 && (
                                                    <>
                                                        <h3 className="text-sm font-medium text-slate-300 mb-2">Existing Files</h3>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {existingAttachments.map((attachment) => (
                                                                <div
                                                                    key={attachment.id.toString()}
                                                                    className="relative group bg-slate-700/50 rounded-lg p-4 flex items-center space-x-3"
                                                                >
                                                                    <div className="flex-shrink-0">
                                                                        {attachment.file_type.includes('image') ? (
                                                                            <img
                                                                                src={attachment.file_url}
                                                                                alt={attachment.file_name}
                                                                                className="h-12 w-12 rounded object-cover"
                                                                            />
                                                                        ) : (
                                                                            <div className="h-12 w-12 rounded bg-slate-600/50 flex items-center justify-center">
                                                                                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                                </svg>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm text-white truncate font-medium">
                                                                            {attachment.file_name}
                                                                        </p>
                                                                        <div className="flex items-center space-x-2 text-xs text-slate-400">
                                                                            <span>{attachment.file_size ? `${(attachment.file_size / 1024 / 1024).toFixed(2)} MB` : 'Size unknown'}</span>
                                                                            <span>•</span>
                                                                            <span>
                                                                                {attachment.uploaded_at
                                                                                    ? new Date(attachment.uploaded_at).toLocaleDateString('en-US', {
                                                                                        year: 'numeric',
                                                                                        month: 'short',
                                                                                        day: 'numeric'
                                                                                    })
                                                                                    : 'Date unknown'
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center space-x-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDownload(attachment)}
                                                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-slate-600/50 rounded"
                                                                            title="Download"
                                                                        >
                                                                            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                                            </svg>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeExistingAttachment(attachment.id)}
                                                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-slate-600/50 rounded"
                                                                            title="Remove"
                                                                        >
                                                                            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </>
                                                )}

                                                {/* New Attachments */}
                                                {attachments.length > 0 && (
                                                    <>
                                                        <h3 className="text-sm font-medium text-slate-300 mb-2">New Files</h3>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {attachments.map((attachment, index) => (
                                                                <div
                                                                    key={index}
                                                                    className="relative group bg-slate-700/50 rounded-lg p-4 flex items-center space-x-3"
                                                                >
                                                                    <div className="flex-shrink-0">
                                                                        {attachment.previewUrl ? (
                                                                            <img
                                                                                src={attachment.previewUrl}
                                                                                alt="Preview"
                                                                                className="h-12 w-12 rounded object-cover"
                                                                            />
                                                                        ) : (
                                                                            <div className="h-12 w-12 rounded bg-slate-600/50 flex items-center justify-center">
                                                                                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                                </svg>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm text-white truncate">
                                                                            {attachment.file.name}
                                                                        </p>
                                                                        <p className="text-xs text-slate-400">
                                                                            {(attachment.file.size / 1024 / 1024).toFixed(2)} MB
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeAttachment(index)}
                                                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-slate-600/50 rounded"
                                                                    >
                                                                        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Submit buttons */}
                                        <div className="sticky bottom-0 bg-slate-800/50 backdrop-blur-xl pt-4 mt-6 flex justify-end space-x-4">
                                            <button
                                                type="submit"
                                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                                            >
                                                Save Changes
                                            </button>
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </motion.form>
                            </AnimatePresence>
                        </div>
                    </Dialog.Panel>
                </div>
            </div>
        </Dialog>
    );
}