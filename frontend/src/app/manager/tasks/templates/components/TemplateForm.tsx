'use client';

import { useState, useEffect } from 'react';
import { Priority, TaskTemplate, TemplateFormData } from '../types';
import { motion } from 'framer-motion';

interface TemplateFormProps {
    initialData?: TaskTemplate;
    onSubmit: (data: TemplateFormData) => Promise<void>;
    onCancel?: () => void;
    isSubmitting: boolean;
}

export default function TemplateForm({
    initialData,
    onSubmit,
    onCancel,
    isSubmitting
}: TemplateFormProps) {
    const [formData, setFormData] = useState<TemplateFormData>({
        name: '',
        description: '',
        default_priority: 'Medium',
        estimated_duration: '1 hours'
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name,
                description: initialData.description || '',
                default_priority: initialData.default_priority,
                estimated_duration: initialData.estimated_duration
            });
        }
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(formData);
    };

    return (
        <motion.div
            className="p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50"
            animate={{
                borderColor: initialData
                    ? 'rgba(59, 130, 246, 0.5)' // Blue border for edit mode
                    : 'rgba(51, 65, 85, 0.5)'   // Default border
            }}
            transition={{ duration: 0.3 }}
        >
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-medium text-white">
                    {initialData ? 'Edit Template' : 'Create New Template'}
                </h2>
                {initialData && (
                    <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-sm text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full"
                    >
                        Editing Mode
                    </motion.span>
                )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Template Name
                    </label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        placeholder="Enter template name"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Description
                    </label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
                        placeholder="Enter template description (optional)"
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
                            value={parseInt(formData.estimated_duration?.split(' ')[0] || '1')}
                            onChange={(e) => setFormData(prev => ({
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
                            value={formData.default_priority}
                            onChange={(e) => setFormData(prev => ({
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

                <div className="flex justify-end space-x-3 pt-4">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm transition-colors duration-300 flex items-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span>Cancel</span>
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl text-sm transition-all duration-300 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>{initialData ? 'Saving...' : 'Creating...'}</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {initialData ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    )}
                                </svg>
                                <span>{initialData ? 'Save Changes' : 'Create Template'}</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </motion.div>
    );
} 