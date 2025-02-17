'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';
import { Task, TaskFormData, TaskTemplate, User, TaskAssignment, TaskAttachment } from './types';
import { AnimatePresence, motion } from 'framer-motion';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { FaMagic } from 'react-icons/fa';

interface FileAttachment {
    file: File;
    previewUrl?: string;
}

const ItemTypes = {
    USER: 'user'
};

interface DraggableUserProps {
    user: User;
    moveUser: (fromList: string, toList: string, userId: number) => void;
    listType: 'available' | 'assigned';
}

interface UserListProps {
    users: User[];
    listType: 'available' | 'assigned';
    moveUser: (fromList: string, toList: string, userId: number) => void;
}

// Add this type for the Gemini API response
interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
        };
    }>;
}

export default function CreateTask() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [templates, setTemplates] = useState<TaskTemplate[]>([]);
    const [userData, setUserData] = useState<User | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTemplateSelection, setIsTemplateSelection] = useState(true);
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);
    const [assignedUsers, setAssignedUsers] = useState<User[]>([]);
    const [attachments, setAttachments] = useState<FileAttachment[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [availableTasks, setAvailableTasks] = useState<Task[]>([]);

    // Form state aligned with database schema
    const [formData, setFormData] = useState<TaskFormData>({
        title: '',
        description: '',
        priority: 'Medium',
        start_date: '',
        due_date: '',
        assigned_to: [],
        dependencies: []
    });

    const loadTemplates = async (departmentId: number) => {
        try {
            const { data, error } = await supabase
                .from('task_templates')
                .select('*')
                .eq('department_id', departmentId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTemplates(data || []);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to load templates');
        }
    };

    const loadDepartmentUsers = async (departmentId: number) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, display_name, job_title, email, department_id')
                .eq('department_id', departmentId);

            if (error) throw error;
            setAvailableUsers(data || []);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to load department users');
        }
    };

    const loadDepartmentTasks = async (departmentId: number) => {
        try {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('department_id', departmentId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAvailableTasks(data || []);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to load department tasks');
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const newAttachments: FileAttachment[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Create preview URL for images
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

    const uploadAttachments = async (taskId: number): Promise<TaskAttachment[]> => {
        console.log('Starting uploadAttachments for taskId:', taskId);
        console.log('Number of attachments to upload:', attachments.length);

        try {
            const uploadPromises = attachments.map(async (attachment) => {
                const file = attachment.file;
                console.log('Processing file:', {
                    name: file.name,
                    type: file.type,
                    size: file.size
                });

                const fileExt = file.name.split('.').pop();
                const fileName = `${taskId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

                console.log('Generated file path:', fileName);

                // First upload the file using supabase.storage
                console.log('Attempting to upload file to storage...');
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('task-attachments')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) {
                    console.error('Storage upload error:', {
                        error: uploadError,
                        fileName: fileName,
                        originalName: file.name,
                        bucket: 'task-attachments'
                    });
                    throw uploadError;
                }

                if (!uploadData?.path) {
                    throw new Error('No path returned from upload');
                }

                // Create the attachment record using the backend API
                const response = await fetch('/api/task-attachments/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        task_id: taskId,
                        file_path: uploadData.path,
                        file_type: file.type,
                        file_size: file.size,
                        file_name: file.name,
                        uploaded_by: userData?.id
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    // Attempt to clean up the uploaded file
                    try {
                        await supabase.storage
                            .from('task-attachments')
                            .remove([uploadData.path]);
                        console.log('Cleanup successful for file:', uploadData.path);
                    } catch (cleanupError) {
                        console.error('Failed to clean up file after error:', cleanupError);
                    }
                    throw new Error(error.detail || 'Failed to create attachment record');
                }

                const data = await response.json();
                console.log('Database record created successfully:', data);
                return data;
            });

            const results = await Promise.all(uploadPromises);
            return results.filter((result): result is TaskAttachment => result !== null);
        } catch (error) {
            console.error('Fatal error in uploadAttachments:', error);
            throw error;
        }
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData) {
            console.log('No user data available, aborting task creation');
            return;
        }

        console.log('Starting task creation process');
        setIsSubmitting(true);
        setIsUploading(true);

        try {
            // Create task record using the backend API
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: formData.title,
                    description: formData.description || null,
                    department_id: userData.department_id,
                    created_by: userData.id,
                    priority: formData.priority,
                    due_date: formData.due_date || null,
                    start_date: formData.start_date || null,
                    template_id: selectedTemplate?.id || null,
                    version: 1
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to create task');
            }

            const taskData = await response.json();

            // Create task assignments
            if (assignedUsers.length > 0) {
                const assignmentResponse = await fetch('/api/task-assignments', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(
                        assignedUsers.map(user => ({
                            task_id: taskData.id,
                            assigned_to: user.id,
                            status: 'To Do',
                            started_at: taskData.start_date
                        }))
                    ),
                });

                if (!assignmentResponse.ok) {
                    throw new Error('Failed to create task assignments');
                }
            }

            // Upload attachments if any
            let uploadedAttachments: TaskAttachment[] = [];
            if (attachments.length > 0) {
                console.log('Starting attachment uploads...');
                try {
                    uploadedAttachments = await uploadAttachments(taskData.id);
                    console.log('All attachments uploaded successfully:', uploadedAttachments);
                } catch (uploadError) {
                    console.error('Attachment upload failed:', uploadError);
                    toast.error('Some attachments failed to upload');
                }
            }

            // Add dependencies if any
            if (formData.dependencies.length > 0) {
                const dependencyResponse = await fetch('/api/task-dependencies', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(
                        formData.dependencies.map(dep => ({
                            task_id: taskData.id,
                            depends_on: dep.depends_on,
                            dependency_type: dep.dependency_type
                        }))
                    ),
                });

                if (!dependencyResponse.ok) {
                    throw new Error('Failed to create task dependencies');
                }
            }

            toast.success('Task created successfully');
            router.push('/manager/tasks/board');
        } catch (error) {
            console.error('Task creation failed:', error);
            toast.error('Failed to create task');
        } finally {
            console.log('Cleaning up...');
            setIsSubmitting(false);
            setIsUploading(false);

            // Clean up preview URLs
            attachments.forEach(attachment => {
                if (attachment.previewUrl) {
                    console.log('Revoking preview URL for:', attachment.file.name);
                    URL.revokeObjectURL(attachment.previewUrl);
                }
            });
        }
    };

    const handleTemplateSelect = (template: TaskTemplate) => {
        setSelectedTemplate(template);
        setIsTemplateSelection(false);
        setFormData({
            ...formData,
            title: template.name,
            description: template.description || '',
            priority: template.default_priority || 'Medium'
        });
    };

    const handleStartFromScratch = () => {
        setSelectedTemplate(null);
        setIsTemplateSelection(false);
        setFormData({
            title: '',
            description: '',
            priority: 'Medium',
            start_date: '',
            due_date: '',
            assigned_to: [],
            dependencies: []
        });
    };

    const moveUser = (fromList: string, toList: string, userId: number) => {
        if (fromList === 'available' && toList === 'assigned') {
            const user = availableUsers.find(u => u.id === userId);
            if (user) {
                setAvailableUsers(availableUsers.filter(u => u.id !== userId));
                setAssignedUsers([...assignedUsers, user]);
            }
        } else if (fromList === 'assigned' && toList === 'available') {
            const user = assignedUsers.find(u => u.id === userId);
            if (user) {
                setAssignedUsers(assignedUsers.filter(u => u.id !== userId));
                setAvailableUsers([...availableUsers, user]);
            }
        }
    };

    const DraggableUser = ({ user, moveUser, listType }: DraggableUserProps) => {
        const [{ isDragging }, drag] = useDrag(() => ({
            type: ItemTypes.USER,
            item: { user, listType },
            collect: (monitor) => ({
                isDragging: monitor.isDragging(),
            }),
        }));

        // Check if this user is the current logged-in user
        const isCurrentUser = user.id === userData?.id;

        return (
            <div
                ref={drag}
                className={`${isDragging ? 'opacity-50' : 'opacity-100'} cursor-grab active:cursor-grabbing`}
            >
                <div className="flex items-center space-x-3 p-3 bg-slate-700/50 rounded-lg">
                    <div className="h-12 w-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-lg text-white font-medium">
                        {user.display_name?.split(' ').map((n: string) => n[0]).join('') || ''}
                    </div>
                    <div className="flex-1">
                        <div className="text-white font-medium">
                            {user.display_name || ''}
                            {isCurrentUser && <span className="ml-2 text-blue-400">(You)</span>}
                        </div>
                        <div className="text-slate-400 text-sm">{user.job_title || ''}</div>
                    </div>
                </div>
            </div>
        );
    };

    const UserList = ({ users, listType, moveUser }: UserListProps) => {
        const [{ isOver }, drop] = useDrop(() => ({
            accept: ItemTypes.USER,
            drop: (item: { user: any; listType: string }) => {
                if (item.listType !== listType) {
                    moveUser(item.listType, listType, item.user.id);
                }
            },
            collect: (monitor) => ({
                isOver: monitor.isOver(),
            }),
        }));

        return (
            <div
                ref={drop}
                className={`min-h-[200px] bg-slate-800/50 rounded-lg p-4 space-y-2 
                    ${isOver ? 'border-2 border-blue-500' : ''} 
                    ${listType === 'assigned' ? 'border-2 border-dashed border-blue-500/30' : ''}`}
            >
                {users.map((user, index) => (
                    <DraggableUser
                        key={user.id}
                        user={user}
                        index={index}
                        moveUser={moveUser}
                        listType={listType}
                    />
                ))}
            </div>
        );
    };

    const AssignmentSection = () => (
        <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
                Assign Team Members
            </label>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                    <div className="text-sm text-slate-400">Available Team Members</div>
                    <UserList
                        users={availableUsers}
                        listType="available"
                        moveUser={moveUser}
                    />
                </div>
                <div className="space-y-4">
                    <div className="text-sm text-slate-400">Assigned Team Members</div>
                    <UserList
                        users={assignedUsers}
                        listType="assigned"
                        moveUser={moveUser}
                    />
                </div>
            </div>
        </div>
    );

    const AttachmentSection = () => (
        <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
                Attachments
            </label>
            <div className="space-y-4">
                <div className="flex items-center justify-center w-full">
                    <label className="w-full flex flex-col items-center px-4 py-6 bg-slate-700/50 text-slate-300 rounded-lg cursor-pointer hover:bg-slate-600/50 transition-colors">
                        <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <span className="text-sm">Click to add files</span>
                        <input
                            type="file"
                            className="hidden"
                            multiple
                            onChange={handleFileSelect}
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        />
                    </label>
                </div>

                {attachments.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                        {attachments.map((attachment, index) => (
                            <div key={index} className="relative group">
                                <div className="p-4 bg-slate-700/50 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        {attachment.previewUrl ? (
                                            <img
                                                src={attachment.previewUrl}
                                                alt="Preview"
                                                className="w-12 h-12 object-cover rounded"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 bg-slate-600 rounded flex items-center justify-center">
                                                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                        )}
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
                                            className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    const DependencySection = () => (
        <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
                Task Dependencies
            </label>
            <div className="space-y-4">
                {formData.dependencies.map((dep, index) => (
                    <div key={index} className="flex items-center space-x-4 bg-slate-700/50 p-4 rounded-lg">
                        <div className="flex-1">
                            <select
                                value={dep.depends_on}
                                onChange={(e) => {
                                    const newDeps = [...formData.dependencies];
                                    newDeps[index].depends_on = Number(e.target.value);
                                    setFormData({ ...formData, dependencies: newDeps });
                                }}
                                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            >
                                <option className="bg-slate-800" value="">Select a task</option>
                                {availableTasks.map((task) => (
                                    <option className="bg-slate-800" key={task.id} value={task.id}>
                                        {task.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="w-48">
                            <select
                                value={dep.dependency_type}
                                onChange={(e) => {
                                    const newDeps = [...formData.dependencies];
                                    newDeps[index].dependency_type = e.target.value;
                                    setFormData({ ...formData, dependencies: newDeps });
                                }}
                                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            >
                                <option className="bg-slate-800" value="blocks">Blocks</option>
                                <option className="bg-slate-800" value="requires">Requires</option>
                                <option className="bg-slate-800" value="related">Related</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const newDeps = [...formData.dependencies];
                                newDeps.splice(index, 1);
                                setFormData({ ...formData, dependencies: newDeps });
                            }}
                            className="p-2 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800/50"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => {
                        setFormData({
                            ...formData,
                            dependencies: [...formData.dependencies, { depends_on: 0, dependency_type: 'blocks' }]
                        });
                    }}
                    className="w-full px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 rounded-lg transition-colors flex items-center justify-center space-x-2 border border-slate-600/50 hover:border-slate-500/50"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Add Dependency</span>
                </button>
            </div>
        </div>
    );

    // Add this function at the component level
    const generateDescription = async (title: string) => {
        try {
            const response = await fetch('/api/gemini/task/description', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title })
            });

            if (!response.ok) {
                throw new Error('Failed to generate description');
            }

            const data = await response.json();
            return data.candidates[0]?.content?.parts[0]?.text || '';
        } catch (error) {
            console.error('Error generating description:', error);
            toast.error('Failed to generate description');
            return '';
        }
    };

    // Add title generation function
    const generateTitle = async (description: string) => {
        try {
            const response = await fetch('/api/gemini/task/title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ description })
            });

            if (!response.ok) {
                throw new Error('Failed to generate title');
            }

            const data = await response.json();
            return data.candidates[0]?.content?.parts[0]?.text.trim() || '';
        } catch (error) {
            console.error('Error generating title:', error);
            toast.error('Failed to generate title');
            return '';
        }
    };

    // Add this new function after the existing generate functions
    const decomposeTask = async (taskDescription: string) => {
        try {
            const response = await fetch('/api/gemini/task/decompose', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ description: taskDescription })
            });

            if (!response.ok) {
                throw new Error('Failed to decompose task');
            }

            const data = await response.json();
            return data.candidates[0]?.content?.parts[0]?.text || '';
        } catch (error) {
            console.error('Error decomposing task:', error);
            toast.error('Failed to decompose task');
            return '';
        }
    };

    // Add this new component after the existing template buttons and before the "Start from scratch" button
    const TaskDecomposer = () => {
        const [decompositionInput, setDecompositionInput] = useState('');
        const [decompositionResult, setDecompositionResult] = useState('');
        const [isDecomposing, setIsDecomposing] = useState(false);

        return (
            <div className="p-4 bg-slate-700/50 rounded-lg space-y-4">
                <h3 className="text-white font-medium flex items-center gap-2">
                    <FaMagic className="w-4 h-4 text-blue-400" />
                    Task Decomposer
                </h3>
                <div className="space-y-2">
                    <textarea
                        value={decompositionInput}
                        onChange={(e) => setDecompositionInput(e.target.value)}
                        placeholder="Describe your task here and let AI help break it down into manageable components..."
                        className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-4 py-2 text-white h-24"
                    />
                    <button
                        onClick={async () => {
                            if (!decompositionInput.trim()) {
                                toast.error('Please enter a task description');
                                return;
                            }
                            setIsDecomposing(true);
                            const result = await decomposeTask(decompositionInput);
                            if (result) {
                                setDecompositionResult(result);
                            }
                            setIsDecomposing(false);
                        }}
                        disabled={isDecomposing}
                        className="w-full px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isDecomposing ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                                Decomposing...
                            </>
                        ) : (
                            <>
                                <FaMagic className="w-4 h-4" />
                                Decompose Task
                            </>
                        )}
                    </button>
                </div>
                {decompositionResult && (
                    <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
                        <pre className="text-slate-300 whitespace-pre-wrap text-sm">
                            {decompositionResult}
                        </pre>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(decompositionResult);
                                toast.success('Copied to clipboard!');
                            }}
                            className="mt-2 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                        >
                            Copy to clipboard
                        </button>
                    </div>
                )}
            </div>
        );
    };

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error || !session) {
                    toast.error('Please login first');
                    router.push('/');
                    return;
                }

                const userData = JSON.parse(sessionStorage.getItem('userData') || 'null');

                if (userData?.role?.toLowerCase() !== 'manager') {
                    toast.error('Unauthorized access');
                    router.push('/');
                    return;
                }

                setUserData(userData);
                await loadTemplates(userData.department_id);
                await loadDepartmentUsers(userData.department_id);
                await loadDepartmentTasks(userData.department_id);
            } catch (error) {
                console.error('Error:', error);
                toast.error('Failed to load data');
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, [router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10"></div>
                <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-float-slow"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float-slower"></div>
            </div>

            <div className="relative z-10">
                {/* Header */}
                <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-between">
                            <h1 className="text-2xl font-light text-white">Create New Task</h1>
                            <button
                                onClick={() => router.back()}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors duration-300 flex items-center space-x-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                <span>Back</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="container mx-auto px-4 py-8">
                    <div className="max-w-3xl mx-auto">
                        <AnimatePresence mode="wait">
                            {isTemplateSelection ? (
                                <motion.div
                                    key="template-selector"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6"
                                >
                                    <h2 className="text-xl text-white mb-4">Select a Template</h2>
                                    <div className="grid gap-4">
                                        {templates.length > 0 ? (
                                            <>
                                                {templates.map((template) => (
                                                    <button
                                                        key={template.id}
                                                        onClick={() => handleTemplateSelect(template)}
                                                        className="p-4 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-left transition-colors"
                                                    >
                                                        <h3 className="text-white font-medium">{template.name}</h3>
                                                        <p className="text-slate-300 text-sm mt-1">{template.description}</p>
                                                    </button>
                                                ))}
                                            </>
                                        ) : (
                                            <div className="p-4 bg-slate-700/50 rounded-lg">
                                                <p className="text-slate-300 mb-2">No templates available.</p>
                                                <p className="text-slate-400 text-sm">
                                                    You can create templates in the{' '}
                                                    <button
                                                        onClick={() => router.push('/manager/tasks/templates')}
                                                        className="text-blue-400 hover:text-blue-300 transition-colors"
                                                    >
                                                        templates section
                                                    </button>
                                                    {' '}to streamline your task creation process.
                                                </p>
                                            </div>
                                        )}
                                        <TaskDecomposer />
                                        <button
                                            onClick={handleStartFromScratch}
                                            className="p-4 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg text-blue-400 transition-colors"
                                        >
                                            Start from scratch
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <DndProvider backend={HTML5Backend}>
                                    <motion.form
                                        key="task-form"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6"
                                        onSubmit={handleCreateTask}
                                    >
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Title
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={formData.title}
                                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                                                        required
                                                    />
                                                    {formData.description && !formData.title && (
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                const loadingToast = toast.loading('Generating title...');
                                                                const title = await generateTitle(formData.description);
                                                                if (title) {
                                                                    setFormData(prev => ({ ...prev, title }));
                                                                    toast.success('Title generated!');
                                                                }
                                                                toast.dismiss(loadingToast);
                                                            }}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-blue-400 transition-colors rounded-lg hover:bg-slate-600/50"
                                                            title="Generate title using AI"
                                                        >
                                                            <FaMagic className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Description
                                                </label>
                                                <div className="relative">
                                                    <textarea
                                                        value={formData.description}
                                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white h-32"
                                                    />
                                                    {formData.title && !formData.description && (
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                const loadingToast = toast.loading('Generating description...');
                                                                const description = await generateDescription(formData.title);
                                                                if (description) {
                                                                    setFormData(prev => ({ ...prev, description }));
                                                                    toast.success('Description generated!');
                                                                }
                                                                toast.dismiss(loadingToast);
                                                            }}
                                                            className="absolute right-2 top-2 p-2 text-slate-400 hover:text-blue-400 transition-colors rounded-lg hover:bg-slate-600/50"
                                                            title="Generate description using AI"
                                                        >
                                                            <FaMagic className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                                        Start Date
                                                    </label>
                                                    <input
                                                        type="datetime-local"
                                                        value={formData.start_date}
                                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                                        Due Date
                                                    </label>
                                                    <input
                                                        type="datetime-local"
                                                        value={formData.due_date}
                                                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Priority
                                                </label>
                                                <select
                                                    value={formData.priority}
                                                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskFormData['priority'] })}
                                                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                                >
                                                    <option className="bg-slate-800" value="Low">Low</option>
                                                    <option className="bg-slate-800" value="Medium">Medium</option>
                                                    <option className="bg-slate-800" value="High">High</option>
                                                    <option className="bg-slate-800" value="Critical">Critical</option>
                                                </select>
                                            </div>

                                            <AssignmentSection />
                                            <AttachmentSection />
                                            <DependencySection />

                                            <div className="flex justify-end space-x-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsTemplateSelection(true)}
                                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={isSubmitting}
                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                                                >
                                                    {isSubmitting ? 'Creating...' : 'Create Task'}
                                                </button>
                                            </div>
                                        </div>
                                    </motion.form>
                                </DndProvider>
                            )}
                        </AnimatePresence>
                    </div>
                </main>
            </div>
        </div>
    );
}
