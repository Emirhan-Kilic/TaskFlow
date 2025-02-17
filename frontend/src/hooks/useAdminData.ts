import { useState, useEffect } from 'react';
import { supabase } from '@/app/supabaseClient';
import { User, Department, Task, TaskTemplate } from '@/types/database';
import { formatFileSize } from '@/utils/formatters';
import toast from 'react-hot-toast';

interface SystemStats {
    totalUsers: number;
    totalDepartments: number;
    activeTasks: number;
    storageUsed: string;
}

export function useAdminData() {
    const [users, setUsers] = useState<User[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [templates, setTemplates] = useState<TaskTemplate[]>([]);
    const [stats, setStats] = useState<SystemStats>({
        totalUsers: 0,
        totalDepartments: 0,
        activeTasks: 0,
        storageUsed: '0 MB'
    });

    const fetchData = async () => {
        try {
            // Fetch users
            const { data: usersData, error: usersError } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (usersError) throw usersError;
            setUsers(usersData || []);

            // Fetch departments
            const { data: deptsData, error: deptsError } = await supabase
                .from('departments')
                .select('*')
                .order('name', { ascending: true });

            if (deptsError) throw deptsError;
            setDepartments(deptsData || []);

            // Fetch tasks with assignments
            const { data: tasksData, error: tasksError } = await supabase
                .from('tasks')
                .select(`
                    *,
                    task_assignments(*)
                `)
                .order('created_at', { ascending: false });

            if (tasksError) throw tasksError;
            setTasks(tasksData || []);

            // Fetch templates
            const { data: templatesData, error: templatesError } = await supabase
                .from('task_templates')
                .select('*')
                .order('name', { ascending: true });

            if (templatesError) throw templatesError;
            setTemplates(templatesData || []);

            // Calculate system stats
            const activeTasks = tasksData?.filter(task => 
                task.task_assignments?.some(assignment => 
                    assignment.status !== 'Completed'
                )
            ).length || 0;

            // Get total storage used
            const { data: attachmentsData } = await supabase
                .from('task_attachments')
                .select('file_size');

            const totalSize = attachmentsData?.reduce((acc, curr) => acc + Number(curr.file_size), 0) || 0;

            setStats({
                totalUsers: usersData?.length || 0,
                totalDepartments: deptsData?.length || 0,
                activeTasks,
                storageUsed: formatFileSize(BigInt(totalSize))
            });

        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to load data');
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    return {
        users,
        departments,
        tasks,
        templates,
        stats,
        refetch: fetchData
    };
} 