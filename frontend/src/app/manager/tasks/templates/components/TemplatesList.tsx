'use client';

import { Priority } from '../types';
import { useState } from 'react';

interface TaskTemplate {
    id: number;
    name: string;
    description: string | null;
    default_priority: Priority;
    estimated_duration: string;
    department_id: number;
    created_by: number;
    created_at: string;
}

interface TemplatesListProps {
    templates: TaskTemplate[];
    onEdit: (template: TaskTemplate) => void;
    onDelete: (templateId: number) => void;
}

export default function TemplatesList({ templates, onEdit, onDelete }: TemplatesListProps) {
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    if (templates.length === 0) {
        return (
            <div className="text-center py-12 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-slate-700/50 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No Templates Yet</h3>
                <p className="text-slate-400 max-w-sm mx-auto">
                    Create your first task template to streamline your department's workflow.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {templates.map((template) => (
                <div
                    key={template.id}
                    className="group p-6 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 hover:border-slate-600 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5"
                >
                    <div className="flex items-start justify-between mb-4">
                        <h3 className="text-lg font-medium text-white group-hover:text-blue-400 transition-colors duration-300">
                            {template.name}
                        </h3>
                        <span className={`px-3 py-1 rounded-lg text-sm font-medium ${template.default_priority === 'Critical' ? 'bg-purple-500/20 text-purple-400' :
                            template.default_priority === 'High' ? 'bg-red-500/20 text-red-400' :
                                template.default_priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-green-500/20 text-green-400'
                            }`}>
                            {template.default_priority}
                        </span>
                    </div>
                    <p className="text-slate-400 mb-4 line-clamp-3">
                        {template.description || 'No description provided'}
                    </p>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500 flex items-center space-x-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{parseInt(template.estimated_duration)}h</span>
                        </span>
                        <div className="flex items-center space-x-2">
                            {deleteConfirm === template.id ? (
                                <>
                                    <button
                                        onClick={() => onDelete(template.id)}
                                        className="text-sm text-red-400 hover:text-red-300 transition-colors duration-300"
                                    >
                                        Confirm
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(null)}
                                        className="text-sm text-slate-400 hover:text-slate-300 transition-colors duration-300"
                                    >
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => onEdit(template)}
                                        className="text-sm text-slate-400 hover:text-blue-400 transition-colors duration-300"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(template.id)}
                                        className="text-sm text-slate-400 hover:text-red-400 transition-colors duration-300"
                                    >
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
} 