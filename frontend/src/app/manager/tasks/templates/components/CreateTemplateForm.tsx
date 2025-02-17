'use client';

import { useState } from 'react';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';
import { Priority } from '../types';

interface CreateTemplateFormProps {
    userData: any;
    onTemplateCreated: () => void;
}

export default function CreateTemplateForm({ userData, onTemplateCreated }: CreateTemplateFormProps) {
    const [isCreating, setIsCreating] = useState(false);
    const [newTemplate, setNewTemplate] = useState({
        name: '',
        description: '',
        default_priority: 'Medium' as Priority,
        estimated_duration: '1 hours'
    });

    const handleCreateTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreating(true);

        try {
            const { error } = await supabase
                .from('task_templates')
                .insert([
                    {
                        ...newTemplate,
                        department_id: userData.department_id,
                        created_by: userData.id
                    }
                ]);

            if (error) throw error;

            toast.success('Template created successfully');
            onTemplateCreated();
            setNewTemplate({
                name: '',
                description: '',
                default_priority: 'Medium',
                estimated_duration: '1 hours'
            });
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to create template');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50">
            <h2 className="text-xl font-medium text-white mb-4">Create New Template</h2>
            <form onSubmit={handleCreateTemplate} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Template Name
                    </label>
                    <input
                        type="text"
                        value={newTemplate.name}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Description
                    </label>
                    <textarea
                        value={newTemplate.description}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Estimated Duration (hours)
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={parseInt(newTemplate.estimated_duration?.split(' ')[0] || '1')}
                            onChange={(e) => setNewTemplate(prev => ({
                                ...prev,
                                estimated_duration: `${e.target.value} hours`
                            }))}
                            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Default Priority
                        </label>
                        <select
                            value={newTemplate.default_priority}
                            onChange={(e) => setNewTemplate(prev => ({
                                ...prev,
                                default_priority: e.target.value as Priority
                            }))}
                            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                            style={{ WebkitAppearance: 'none' }}
                            required
                        >
                            <option value="Low" className="bg-slate-800">Low</option>
                            <option value="Medium" className="bg-slate-800">Medium</option>
                            <option value="High" className="bg-slate-800">High</option>
                            <option value="Critical" className="bg-slate-800">Critical</option>
                        </select>
                    </div>
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isCreating}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl text-sm transition-all duration-300 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isCreating ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Creating...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>Create Template</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
} 