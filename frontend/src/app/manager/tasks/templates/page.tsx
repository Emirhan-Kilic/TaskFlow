'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';
import TemplatesList from './components/TemplatesList';
import TemplateForm from './components/TemplateForm';
import { TaskTemplate, TemplateFormData } from './types';
import { AnimatePresence, motion } from 'framer-motion';

export default function TaskTemplates() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [templates, setTemplates] = useState<TaskTemplate[]>([]);
    const [userData, setUserData] = useState<any>(null);
    const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadTemplates = async (departmentId: number) => {
        try {
            const response = await fetch(`/api/task-templates?department_id=${departmentId}`);
            if (!response.ok) throw new Error('Failed to load templates');
            const data = await response.json();
            setTemplates(data || []);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to load templates');
        }
    };

    const handleEditTemplate = async (formData: TemplateFormData) => {
        if (!editingTemplate) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/task-templates/${editingTemplate.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description,
                    default_priority: formData.default_priority,
                    estimated_duration: formData.estimated_duration,
                    department_id: userData.department_id
                }),
            });

            if (!response.ok) throw new Error('Failed to update template');

            toast.success('Template updated successfully');
            await loadTemplates(userData.department_id);
            setEditingTemplate(null);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to update template');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTemplate = async (templateId: number) => {
        try {
            const response = await fetch(`/api/task-templates/${templateId}`, {
                method: 'DELETE',
            });

            if (!response.ok) throw new Error('Failed to delete template');

            toast.success('Template deleted successfully');
            await loadTemplates(userData.department_id);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to delete template');
        }
    };

    const handleBatchDelete = async (templateIds: number[]) => {
        try {
            const response = await fetch('/api/task-templates/batch-delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ template_ids: templateIds }),
            });

            if (!response.ok) throw new Error('Failed to delete templates');

            toast.success(`${templateIds.length} template${templateIds.length === 1 ? '' : 's'} deleted successfully`);
            await loadTemplates(userData.department_id);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to delete templates');
        }
    };

    const handleDuplicateTemplate = async (template: TaskTemplate) => {
        try {
            const response = await fetch('/api/task-templates/duplicate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    template_id: template.id,
                    department_id: userData.department_id
                }),
            });

            if (!response.ok) throw new Error('Failed to duplicate template');

            toast.success('Template duplicated successfully');
            await loadTemplates(userData.department_id);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to duplicate template');
        }
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
            } catch (error) {
                console.error('Error:', error);
                toast.error('Failed to load templates');
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
                            <h1 className="text-2xl font-light text-white">Task Templates</h1>
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
                    <div className="max-w-6xl mx-auto">
                        {/* Templates List Header */}
                        <div className="mb-6">
                            <h2 className="text-2xl font-medium text-white">Your Templates</h2>
                            <p className="text-slate-400 text-sm mt-1">
                                {templates.length > 0
                                    ? `${templates.length} template${templates.length === 1 ? '' : 's'} available`
                                    : 'No templates created yet'}
                            </p>
                        </div>

                        <TemplatesList
                            templates={templates}
                            onEdit={setEditingTemplate}
                            onDelete={handleDeleteTemplate}
                            onBatchDelete={handleBatchDelete}
                            onDuplicate={handleDuplicateTemplate}
                        />

                        <AnimatePresence mode="wait">
                            {editingTemplate ? (
                                <motion.div
                                    key="edit-form"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                    className="relative"
                                >
                                    <motion.div
                                        initial={{ scale: 0, y: 20 }}
                                        animate={{ scale: 1, y: 0 }}
                                        className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-sm font-medium shadow-lg backdrop-blur-sm"
                                    >
                                        Editing Template
                                    </motion.div>
                                    <div className="mt-4">
                                        <TemplateForm
                                            initialData={editingTemplate}
                                            onSubmit={handleEditTemplate}
                                            onCancel={() => setEditingTemplate(null)}
                                            isSubmitting={isSubmitting}
                                        />
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="create-form"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                >
                                    <TemplateForm
                                        onSubmit={async (formData) => {
                                            setIsSubmitting(true);
                                            try {
                                                const { error } = await supabase
                                                    .from('task_templates')
                                                    .insert([{
                                                        ...formData,
                                                        department_id: userData.department_id,
                                                        created_by: userData.id
                                                    }]);

                                                if (error) throw error;

                                                toast.success('Template created successfully');
                                                await loadTemplates(userData.department_id);
                                            } catch (error) {
                                                console.error('Error:', error);
                                                toast.error('Failed to create template');
                                            } finally {
                                                setIsSubmitting(false);
                                            }
                                        }}
                                        isSubmitting={isSubmitting}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </main>
            </div>
        </div>
    );
}
