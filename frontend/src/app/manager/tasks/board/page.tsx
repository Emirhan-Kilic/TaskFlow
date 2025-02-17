'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabaseClient';
import toast from 'react-hot-toast';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Dialog } from '@headlessui/react';
import EditTaskForm from "./EditTaskForm";
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { VirtualScroll } from 'your-virtual-scroll-library';

// Update interfaces to match database schema exactly
interface User {
    id: bigint;
    email: string;
    role: 'admin' | 'manager' | 'personnel';
    department_id: bigint;
    profile_picture: string | null;
    display_name: string;
    job_title: string;
    last_login: string | null;
    created_at: string;
    updated_at: string;
    auth_uid: string;
}

interface TaskAssignment {
    id: bigint;
    task_id: bigint;
    assigned_to: User;
    status: 'To Do' | 'In Progress' | 'Under Review' | 'Completed';
    progress: number;
    comments: string | null;
    started_at: string | null;
    completed_at: string | null;
    version: number;
    created_at: string;
    updated_at: string;
}

interface Task {
    id: bigint;
    title: string;
    description: string | null;
    department_id: bigint;
    created_by: bigint;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    due_date: string | null;
    start_date: string | null;
    version: number;
    template_id: bigint | null;
    created_at: string;
    updated_at: string;
    task_assignments: TaskAssignment[];
    created_by_user: { display_name: string };
}

interface TaskDependency {
    id: bigint;
    task_id: bigint;
    depends_on: bigint;
    dependency_type: 'blocks' | 'requires' | 'related';
    created_at: string;
}

// Add a helper function for generating initials avatar
const getInitialsAvatar = (displayName: string) => {
    return displayName.split(' ').map(n => n[0]).join('');
};

// Add type for drag item
interface DragItem {
    type: string;
    taskId: bigint;
    currentStatus: string;
}

// Task Card Component
const TaskCard = ({ task, onStatusChange, onEdit }: {
    task: Task;
    onStatusChange: (taskId: bigint, newStatus: string) => Promise<void>;
    onEdit: (task: Task) => void;
}) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'task',
        item: {
            type: 'task',
            taskId: task.id,
            currentStatus: task.task_assignments[0]?.status
        },
        collect: (monitor) => ({
            isDragging: monitor.isDragging()
        }),
        end: (item, monitor) => {
            const dropResult = monitor.getDropResult();
            if (!dropResult) {
                // If no valid drop, task returns to original position
                return;
            }
        }
    }), [task.id, task.task_assignments]);

    return (
        <div
            ref={drag}
            className={`p-4 bg-slate-700/50 rounded-xl border border-slate-600/50 hover:border-slate-500/50 transition-colors cursor-move ${isDragging ? 'opacity-50' : 'opacity-100'
                }`}
            style={{ touchAction: 'none' }}
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="text-white font-medium">{task.title}</h4>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit(task);
                    }}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                </button>
            </div>
            {task.description && (
                <p className="text-sm text-slate-300 mb-2 line-clamp-2">
                    {task.description}
                </p>
            )}
            <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-1 rounded ${task.priority === 'Critical' ? 'bg-red-500/20 text-red-400' :
                    task.priority === 'High' ? 'bg-orange-500/20 text-orange-400' :
                        task.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-blue-500/20 text-blue-400'
                    }`}>
                    {task.priority}
                </span>
                {task.due_date && (
                    <span className="text-xs text-slate-400">
                        Due: {new Date(task.due_date).toLocaleDateString()}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                {task.task_assignments.map(assignment => (
                    <div
                        key={assignment.id}
                        className="flex items-center"
                        title={`${assignment.assigned_to.display_name} - ${assignment.progress}% complete`}
                    >
                        {assignment.assigned_to.profile_picture ? (
                            <img
                                src={assignment.assigned_to.profile_picture}
                                alt={assignment.assigned_to.display_name}
                                className="w-8 h-8 rounded-full"
                            />
                        ) : (
                            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-sm text-white font-medium">
                                {getInitialsAvatar(assignment.assigned_to.display_name)}
                            </div>
                        )}
                        {assignment.progress > 0 && (
                            <span className="text-xs text-slate-400 ml-1">
                                {assignment.progress}%
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Column Component
const Column = ({ status, tasks, onStatusChange, onEdit }: {
    status: string;
    tasks: Task[];
    onStatusChange: (taskId: bigint, newStatus: string) => Promise<void>;
    onEdit: (task: Task) => void;
}) => {
    const [{ isOver, canDrop }, drop] = useDrop(() => ({
        accept: 'task',
        drop: (item: DragItem) => {
            if (item.currentStatus !== status) {
                onStatusChange(item.taskId, status);
                return { status };
            }
            return undefined;
        },
        canDrop: (item: DragItem) => {
            // Prevent dropping if status is the same
            return item.currentStatus !== status;
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop()
        })
    }), [status, onStatusChange]);

    return (
        <div
            ref={drop}
            className={`p-4 bg-slate-800/50 backdrop-blur-xl rounded-2xl border transition-colors ${isOver && canDrop ? 'border-blue-500/50 bg-slate-800/70' :
                    isOver && !canDrop ? 'border-red-500/50' :
                        'border-slate-700/50'
                }`}
        >
            <h3 className="text-lg font-medium text-white mb-4 flex items-center justify-between">
                {status}
                <span className="text-sm text-slate-400 bg-slate-700/50 px-2 py-1 rounded">
                    {tasks.filter(task =>
                        task.task_assignments.some(ta => ta.status === status)
                    ).length}
                </span>
            </h3>
            <div className="space-y-4 min-h-[100px]">
                {tasks
                    .filter(task => task.task_assignments.some(ta => ta.status === status))
                    .map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onStatusChange={onStatusChange}
                            onEdit={onEdit}
                        />
                    ))}
            </div>
        </div>
    );
};

const getProgressForStatus = (status: string): number => {
    switch (status) {
        case 'To Do': return 0;
        case 'In Progress': return 25;
        case 'Under Review': return 75;
        case 'Completed': return 100;
        default: return 0;
    }
};

// Add this helper function at the top level
const findCriticalPath = (tasks: Task[], dependencies: TaskDependency[]) => {
    // Create adjacency list
    const graph = new Map<bigint, bigint[]>();
    const weights = new Map<string, number>();
    const inDegree = new Map<bigint, number>();

    // Initialize graphs
    tasks.forEach(task => {
        graph.set(task.id, []);
        inDegree.set(task.id, 0);
    });

    // Build dependency graph
    dependencies.forEach(dep => {
        if (dep.dependency_type === 'blocks' || dep.dependency_type === 'requires') {
            const from = dep.depends_on;
            const to = dep.task_id;
            graph.get(from)?.push(to);
            inDegree.set(to, (inDegree.get(to) || 0) + 1);

            // Weight is based on task priority and status
            const task = tasks.find(t => t.id === to);
            const priorityWeight = {
                'Critical': 4,
                'High': 3,
                'Medium': 2,
                'Low': 1
            }[task?.priority || 'Low'];

            const statusWeight = task?.task_assignments[0]?.status === 'Completed' ? 0 : 1;
            weights.set(`${from}-${to}`, priorityWeight * statusWeight);
        }
    });

    // Find longest path using topological sort
    const queue: bigint[] = [];
    const dist = new Map<bigint, number>();
    const prev = new Map<bigint, bigint>();

    // Initialize distances
    tasks.forEach(task => {
        dist.set(task.id, 0);
        if (inDegree.get(task.id) === 0) {
            queue.push(task.id);
        }
    });

    // Process queue
    while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = graph.get(current) || [];

        for (const next of neighbors) {
            const weight = weights.get(`${current}-${next}`) || 0;
            const newDist = (dist.get(current) || 0) + weight;

            if (newDist > (dist.get(next) || 0)) {
                dist.set(next, newDist);
                prev.set(next, current);
            }

            inDegree.set(next, (inDegree.get(next) || 0) - 1);
            if (inDegree.get(next) === 0) {
                queue.push(next);
            }
        }
    }

    // Find end node with maximum distance
    let maxDist = 0;
    let endNode: bigint | null = null;
    dist.forEach((distance, node) => {
        if (distance > maxDist) {
            maxDist = distance;
            endNode = node;
        }
    });

    // Reconstruct path
    const criticalPath: bigint[] = [];
    let current = endNode;
    while (current != null) {
        criticalPath.unshift(current);
        current = prev.get(current) || null;
    }

    return criticalPath;
};

// Update the DependencyGraph component
const   DependencyGraph = ({ tasks, dependencies }: {
    tasks: Task[],
    dependencies: TaskDependency[]
}) => {
    const networkRef = useRef<HTMLDivElement>(null);
    const [network, setNetwork] = useState<Network | null>(null);
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [filterDependencyType, setFilterDependencyType] = useState<string>('all');
    const nodesDataSet = useRef<DataSet<any> | null>(null);
    const edgesDataSet = useRef<DataSet<any> | null>(null);
    const [criticalPath, setCriticalPath] = useState<bigint[]>([]);

    // Define network options
    const networkOptions = {
        nodes: {
            shape: 'box',
            margin: 12,
            widthConstraint: {
                minimum: 150,
                maximum: 250
            },
            heightConstraint: {
                minimum: 50
            }
        },
        edges: {
            smooth: {
                type: 'straightCross',
                roundness: 0.3
            },
            length: 250
        },
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -3000,
                centralGravity: 0.3,
                springLength: 200,
                springConstant: 0.04,
                damping: 0.09,
                avoidOverlap: 0.1
            },
            stabilization: {
                enabled: true,
                iterations: 1000,
                updateInterval: 100,
                onlyDynamicEdges: false,
                fit: true
            }
        },
        layout: {
            improvedLayout: true,
            hierarchical: {
                enabled: true,
                direction: 'LR',
                sortMethod: 'directed',
                levelSeparation: 250,
                nodeSpacing: 200,
                treeSpacing: 200,
                blockShifting: true,
                edgeMinimization: true,
                parentCentralization: true
            }
        }
    };

    // Memoize filtered data calculations
    const filteredData = useMemo(() => {
        const filteredTasks = tasks.filter(task =>
            filterPriority === 'all' || task.priority === filterPriority
        );

        const filteredDependencies = dependencies.filter(dep =>
            filterDependencyType === 'all' || dep.dependency_type === filterDependencyType
        );

        return {
            nodes: filteredTasks.map(task => ({
                id: Number(task.id),
                label: `${task.title}\n${task.task_assignments[0]?.status || 'No Status'}`,
                color: {
                    background: (() => {
                        const status = task.task_assignments[0]?.status;
                        switch (status) {
                            case 'To Do': return '#1e293b';
                            case 'In Progress': return '#3b82f6';
                            case 'Under Review': return '#f59e0b';
                            case 'Completed': return '#22c55e';
                            default: return '#1e293b';
                        }
                    })(),
                    border: '#475569',
                },
                font: {
                    color: '#f8fafc',
                    size: 14,
                    multi: true,
                    bold: true
                },
                shape: 'box',
                margin: 12,
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.2)',
                    size: 4,
                    x: 2,
                    y: 2
                }
            })),
            edges: filteredDependencies.map(dep => ({
                id: Number(dep.id),
                from: Number(dep.depends_on),
                to: Number(dep.task_id),
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 0.8,
                        type: 'arrow'
                    }
                },
                color: {
                    color: (() => {
                        switch (dep.dependency_type) {
                            case 'blocks': return '#dc2626';
                            case 'requires': return '#2563eb';
                            case 'related': return '#16a34a';
                            default: return '#475569';
                        }
                    })(),
                    opacity: 0.8
                },
                dashes: dep.dependency_type === 'related' ? [5, 5] : false,
                width: (() => {
                    switch (dep.dependency_type) {
                        case 'blocks': return 2.5;
                        case 'requires': return 2;
                        case 'related': return 1.5;
                        default: return 2;
                    }
                })(),
                smooth: {
                    type: 'straightCross',
                    roundness: 0.3
                }
            }))
        };
    }, [tasks, dependencies, filterPriority, filterDependencyType]);

    // Initialize network
    useEffect(() => {
        if (!networkRef.current) return;

        // Create DataSets
        nodesDataSet.current = new DataSet(filteredData.nodes);
        edgesDataSet.current = new DataSet(filteredData.edges);

        // Create network with DataSets and options
        const newNetwork = new Network(
            networkRef.current,
            {
                nodes: nodesDataSet.current,
                edges: edgesDataSet.current
            },
            networkOptions
        );

        setNetwork(newNetwork);

        // Disable physics after initial stabilization
        newNetwork.once('stabilizationIterationsDone', () => {
            newNetwork.setOptions({ physics: { enabled: false } });
        });

        return () => {
            if (newNetwork) {
                newNetwork.destroy();
            }
        };
    }, []); // Empty dependency array as we only want to create the network once

    // Update data when filters change
    useEffect(() => {
        if (nodesDataSet.current && edgesDataSet.current) {
            nodesDataSet.current.clear();
            edgesDataSet.current.clear();
            nodesDataSet.current.add(filteredData.nodes);
            edgesDataSet.current.add(filteredData.edges);
        }
    }, [filteredData]);

    const handleZoomIn = () => {
        if (!network) return;
        const scale = network.getScale();
        network.moveTo({
            scale: scale * 1.2,
            animation: true
        });
    };

    const handleZoomOut = () => {
        if (!network) return;
        const scale = network.getScale();
        network.moveTo({
            scale: scale * 0.8,
            animation: true
        });
    };

    const handleFitView = () => {
        if (!network) return;
        network.fit({
            animation: true
        });
    };

    // Add this function
    const highlightCriticalPath = () => {
        const path = findCriticalPath(tasks, dependencies);
        setCriticalPath(path);

        // Update network visualization
        if (network && nodesDataSet.current && edgesDataSet.current) {
            // Reset all nodes and edges
            nodesDataSet.current.forEach(node => {
                nodesDataSet.current?.update({
                    id: node.id,
                    color: {
                        ...node.color,
                        border: '#475569'
                    },
                    shadow: {
                        enabled: true,
                        color: 'rgba(0,0,0,0.2)'
                    }
                });
            });

            // Highlight critical path nodes and edges
            path.forEach((nodeId, index) => {
                nodesDataSet.current?.update({
                    id: Number(nodeId),
                    color: {
                        border: '#dc2626',
                    },
                    shadow: {
                        enabled: true,
                        color: 'rgba(220,38,38,0.4)',
                        size: 10
                    }
                });

                // Highlight edges between critical path nodes
                if (index < path.length - 1) {
                    const nextNodeId = path[index + 1];
                    const edge = edgesDataSet.current?.get().find(e =>
                        e.from === Number(nodeId) && e.to === Number(nextNodeId)
                    );
                    if (edge) {
                        edgesDataSet.current?.update({
                            id: edge.id,
                            color: {
                                color: '#dc2626',
                                opacity: 1
                            },
                            width: 3
                        });
                    }
                }
            });

            // Fit view to show the critical path
            network.fit({
                nodes: path.map(id => Number(id)),
                animation: true
            });
        }

        // Show toast with critical path info
        const pathTasks = path.map(id => tasks.find(t => t.id === id)?.title).filter(Boolean);
        toast.success(
            <div>
                <strong>Critical Path Found:</strong>
                <br />
                {pathTasks.join(' → ')}
            </div>,
            { duration: 5000 }
        );
    };

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 mb-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-white">Task Dependencies</h2>
                <div className="flex gap-4">
                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="bg-slate-700 text-slate-200 rounded px-3 py-1"
                    >
                        <option value="all">All Priorities</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>

                    <select
                        value={filterDependencyType}
                        onChange={(e) => setFilterDependencyType(e.target.value)}
                        className="bg-slate-700 text-slate-200 rounded px-3 py-1"
                    >
                        <option value="all">All Dependencies</option>
                        <option value="blocks">Blocks</option>
                        <option value="requires">Requires</option>
                        <option value="related">Related</option>
                    </select>

                    <button
                        onClick={highlightCriticalPath}
                        className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded transition-colors"
                    >
                        Show Critical Path
                    </button>
                </div>
            </div>

            <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-red-600"></div>
                    <span className="text-sm text-slate-300">Blocks</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-blue-600"></div>
                    <span className="text-sm text-slate-300">Requires</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-green-600 dashed border-dashed"></div>
                    <span className="text-sm text-slate-300">Related</span>
                </div>
            </div>

            <div className="relative">
                <div ref={networkRef} className="w-full h-[500px]" />

                <div className="absolute bottom-4 right-4 flex gap-2">
                    <button
                        onClick={handleFitView}
                        className="p-2 bg-slate-700 rounded hover:bg-slate-600 text-white"
                        title="Fit to view"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                    </button>
                    <button
                        onClick={handleZoomIn}
                        className="p-2 bg-slate-700 rounded hover:bg-slate-600 text-white"
                        title="Zoom in"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                    <button
                        onClick={handleZoomOut}
                        className="p-2 bg-slate-700 rounded hover:bg-slate-600 text-white"
                        title="Zoom out"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

const TaskMetrics = ({ tasks }: { tasks: Task[] }) => {
    const calculateAverageCompletionTime = () => {
        const completedTasks = tasks.filter(t =>
            t.task_assignments.some(ta => ta.status === 'Completed' && ta.started_at && ta.completed_at)
        );

        if (completedTasks.length === 0) return 'N/A';

        const totalDays = completedTasks.reduce((sum, task) => {
            const assignment = task.task_assignments.find(ta =>
                ta.status === 'Completed' && ta.started_at && ta.completed_at
            );

            if (!assignment?.started_at || !assignment?.completed_at) return sum;

            const start = new Date(assignment.started_at);
            const end = new Date(assignment.completed_at);
            const days = Math.max(
                (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
                0.01  // Minimum of 0.01 days (about 14 minutes) to avoid showing 0
            );

            console.log(`Task ${task.title}:`, {
                started_at: assignment.started_at,
                completed_at: assignment.completed_at,
                days: days
            });

            return sum + days;
        }, 0);

        const average = totalDays / completedTasks.length;

        // Format the output based on the duration
        if (average < 1) {
            const hours = Math.round(average * 24);
            return `${hours} hour${hours !== 1 ? 's' : ''}`;
        } else {
            return `${average.toFixed(1)} days`;
        }
    };

    return (
        <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 backdrop-blur-xl p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-slate-400 text-sm">Total Tasks</h3>
                <p className="text-2xl text-white mt-1">{tasks.length}</p>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-xl p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-slate-400 text-sm">Overdue Tasks</h3>
                <p className="text-2xl text-red-500 mt-1">
                    {tasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length}
                </p>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-xl p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-slate-400 text-sm">Completion Rate</h3>
                <p className="text-2xl text-green-500 mt-1">
                    {tasks.length > 0
                        ? `${Math.round((tasks.filter(t =>
                            t.task_assignments.some(ta => ta.status === 'Completed')
                        ).length / tasks.length) * 100)}%`
                        : '0%'
                    }
                </p>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-xl p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-slate-400 text-sm">Average Completion Time</h3>
                <p className="text-2xl text-white mt-1">{calculateAverageCompletionTime()}</p>
            </div>
        </div>
    );
};

const TaskStats = ({ tasks }: { tasks: Task[] }) => {
    const priorityDistribution = tasks.reduce((acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const statusDistribution = tasks.reduce((acc, task) => {
        const status = task.task_assignments[0]?.status || 'No Status';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl p-4 rounded-xl border border-slate-700/50 mb-6">
            <h3 className="text-lg font-medium text-white mb-4">Task Distribution</h3>
            <div className="grid grid-cols-2 gap-8">
                <div>
                    <h4 className="text-sm text-slate-400 mb-2">By Priority</h4>
                    <div className="space-y-2">
                        {Object.entries(priorityDistribution).map(([priority, count]) => (
                            <div key={priority} className="flex items-center">
                                <span className="text-sm text-slate-300 w-20">{priority}</span>
                                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${priority === 'Critical' ? 'bg-red-500' :
                                            priority === 'High' ? 'bg-orange-500' :
                                                priority === 'Medium' ? 'bg-yellow-500' :
                                                    'bg-blue-500'
                                            }`}
                                        style={{ width: `${(count / tasks.length) * 100}%` }}
                                    />
                                </div>
                                <span className="text-sm text-slate-400 ml-2">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h4 className="text-sm text-slate-400 mb-2">By Status</h4>
                    <div className="space-y-2">
                        {Object.entries(statusDistribution).map(([status, count]) => (
                            <div key={status} className="flex items-center">
                                <span className="text-sm text-slate-300 w-24">{status}</span>
                                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${status === 'Completed' ? 'bg-green-500' :
                                            status === 'In Progress' ? 'bg-blue-500' :
                                                status === 'Under Review' ? 'bg-yellow-500' :
                                                    'bg-slate-500'
                                            }`}
                                        style={{ width: `${(count / tasks.length) * 100}%` }}
                                    />
                                </div>
                                <span className="text-sm text-slate-400 ml-2">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fix type definitions and add missing interfaces
interface BulkActionsProps {
    selectedTasks: Set<bigint>;
    onClearSelection: () => void;
    onUpdateStatus: (status: TaskStatus) => Promise<void>;
    onAssign: (userId: bigint) => Promise<void>;
    onExport: () => void;
}

// Add proper type for task status
type TaskStatus = 'To Do' | 'In Progress' | 'Under Review' | 'Completed';

// Improve bulk actions component with better state management
const BulkActions: React.FC<BulkActionsProps> = ({
    selectedTasks,
    onClearSelection,
    onUpdateStatus,
    onAssign,
    onExport
}) => {
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const statusMenuRef = useRef<HTMLDivElement>(null);

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
                setIsStatusOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (selectedTasks.size === 0) return null;

    const statuses: TaskStatus[] = ['To Do', 'In Progress', 'Under Review', 'Completed'];

    return (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-800/90 backdrop-blur-xl rounded-lg shadow-lg border border-slate-700 p-2 flex items-center gap-2 z-50">
            <span className="text-slate-300 px-2">
                {selectedTasks.size} task{selectedTasks.size > 1 ? 's' : ''} selected
            </span>

            <div className="relative" ref={statusMenuRef}>
                <button
                    onClick={() => setIsStatusOpen(!isStatusOpen)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                >
                    Update Status
                </button>
                {isStatusOpen && (
                    <div className="absolute bottom-full mb-2 left-0 bg-slate-800 rounded-lg shadow-lg border border-slate-700 py-1 min-w-[140px]">
                        {statuses.map(status => (
                            <button
                                key={status}
                                onClick={() => {
                                    onUpdateStatus(status);
                                    setIsStatusOpen(false);
                                }}
                                className="block w-full text-left px-4 py-2 hover:bg-slate-700 text-white transition-colors"
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <button
                onClick={onExport}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
            >
                Export Selected
            </button>

            <button
                onClick={onClearSelection}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
            >
                Clear Selection
            </button>
        </div>
    );
};

// Add this custom hook at the top of the file
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}

// Add Timeline view component
const TimelineView = ({ tasks }: { tasks: Task[] }) => {
    const sortedTasks = useMemo(() => {
        return [...tasks].sort((a, b) => {
            const aDate = a.start_date || a.created_at;
            const bDate = b.start_date || b.created_at;
            return new Date(aDate).getTime() - new Date(bDate).getTime();
        });
    }, [tasks]);

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
            <div className="space-y-4">
                {sortedTasks.map(task => {
                    const startDate = task.start_date || task.created_at;
                    const endDate = task.due_date || null;
                    const status = task.task_assignments[0]?.status || 'No Status';
                    const progress = task.task_assignments[0]?.progress || 0;

                    return (
                        <div key={task.id} className="relative">
                            {/* Timeline line */}
                            <div className="absolute left-24 top-0 bottom-0 w-px bg-slate-700" />

                            {/* Task card */}
                            <div className="flex items-start gap-4">
                                {/* Date */}
                                <div className="w-24 pt-2 text-sm text-slate-400">
                                    {new Date(startDate).toLocaleDateString()}
                                </div>

                                {/* Task content */}
                                <div className="flex-1 bg-slate-700/50 rounded-xl p-4 ml-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="text-white font-medium">{task.title}</h4>
                                        <div className={`text-xs px-2 py-1 rounded ${status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                                            status === 'In Progress' ? 'bg-blue-500/20 text-blue-400' :
                                                status === 'Under Review' ? 'bg-yellow-500/20 text-yellow-400' :
                                                    'bg-slate-500/20 text-slate-400'
                                            }`}>
                                            {status}
                                        </div>
                                    </div>

                                    {task.description && (
                                        <p className="text-sm text-slate-300 mb-2">
                                            {task.description}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-1 rounded ${task.priority === 'Critical' ? 'bg-red-500/20 text-red-400' :
                                                task.priority === 'High' ? 'bg-orange-500/20 text-orange-400' :
                                                    task.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {task.priority}
                                            </span>
                                            {endDate && (
                                                <span className="text-xs text-slate-400">
                                                    Due: {new Date(endDate).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>

                                        {progress > 0 && (
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-24 bg-slate-600 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 rounded-full"
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-slate-400">
                                                    {progress}%
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-2">
                                        {task.task_assignments.map(assignment => (
                                            <div
                                                key={assignment.id}
                                                className="flex items-center"
                                                title={assignment.assigned_to.display_name}
                                            >
                                                {assignment.assigned_to.profile_picture ? (
                                                    <img
                                                        src={assignment.assigned_to.profile_picture}
                                                        alt={assignment.assigned_to.display_name}
                                                        className="w-6 h-6 rounded-full"
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xs text-white font-medium">
                                                        {getInitialsAvatar(assignment.assigned_to.display_name)}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Improve TaskKanbanBoard with better error handling and optimizations
export default function TaskKanbanBoard() {
    const router = useRouter();
    const [userData, setUserData] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [teamMembers, setTeamMembers] = useState<User[]>([]);
    const [filterAssignee, setFilterAssignee] = useState<string>('all');
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTasks, setSelectedTasks] = useState<Set<bigint>>(new Set());
    const [viewMode, setViewMode] = useState<'board' | 'timeline'>('board');
    const [taskCache, setTaskCache] = useState<Map<bigint, Task>>(new Map());
    const debouncedSearch = useDebounce(searchTerm, 300);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleStatusChange = async (taskId: bigint, newStatus: string) => {
        try {
            // Create an optimistic update
            const updatedTasks = tasks.map(task => {
                if (task.id === taskId) {
                    return {
                        ...task,
                        task_assignments: task.task_assignments.map(ta => ({
                            ...ta,
                            status: newStatus,
                            progress: getProgressForStatus(newStatus),
                            started_at: newStatus === 'In Progress' ? new Date().toISOString() : ta.started_at,
                            completed_at: newStatus === 'Completed' ? new Date().toISOString() : ta.completed_at,
                            updated_at: new Date().toISOString()
                        }))
                    };
                }
                return task;
            });

            // Update local state immediately
            setTasks(updatedTasks);

            // Get the task assignments for this task
            const { data: assignments, error: fetchError } = await supabase
                .from('task_assignments')
                .select('*')
                .eq('task_id', taskId);

            if (fetchError) throw fetchError;
            if (!assignments) throw new Error('No assignments found');

            const currentTime = new Date().toISOString();
            const newProgress = getProgressForStatus(newStatus);

            // Prepare the update data based on the new status
            const updateData = {
                status: newStatus,
                progress: newProgress,
                updated_at: currentTime,
                ...(newStatus === 'In Progress' && { started_at: currentTime }),
                ...(newStatus === 'Completed' && { completed_at: currentTime })
            };

            // Update all assignments for this task
            const updatePromises = assignments.map(assignment =>
                supabase
                    .from('task_assignments')
                    .update(updateData)
                    .eq('id', assignment.id)
            );

            // If moving to 'Completed', update the task version
            if (newStatus === 'Completed') {
                updatePromises.push(
                    supabase
                        .from('tasks')
                        .update({
                            version: assignments[0].version + 1,
                            updated_at: currentTime
                        })
                        .eq('id', taskId)
                );
            }

            const results = await Promise.all(updatePromises);

            // Check for errors
            const updateError = results.find(result => result.error);
            if (updateError) throw updateError;

            // Create notifications for assignees
            const notificationPromises = assignments.map(assignment =>
                supabase
                    .from('notifications')
                    .insert({
                        user_id: assignment.assigned_to,
                        task_id: taskId,
                        type: 'push',
                        subject: 'Task Status Updated',
                        message: `Task status has been updated to ${newStatus} (${newProgress}% complete)`,
                        created_at: currentTime
                    })
            );

            await Promise.all(notificationPromises);

            // Show appropriate success message
            const statusMessages = {
                'To Do': 'Task reset to To Do',
                'In Progress': 'Task moved to In Progress',
                'Under Review': 'Task is now under review',
                'Completed': 'Task marked as completed'
            };
            toast.success(statusMessages[newStatus as keyof typeof statusMessages]);

        } catch (error) {
            // Revert the optimistic update on error
            const { data: originalTasks } = await supabase
                .from('tasks')
                .select(`
                    id,
                    title,
                    description,
                    department_id,
                    priority,
                    due_date,
                    start_date,
                    version,
                    created_at,
                    updated_at,
                    task_assignments(
                        id,
                        status,
                        progress,
                        comments,
                        started_at,
                        completed_at,
                        version,
                        assigned_to(
                            id,
                            display_name,
                            profile_picture,
                            job_title,
                            department_id,
                            role
                        )
                    ),
                    created_by_user:created_by(display_name)
                `)
                .eq('department_id', userData?.department_id);

            setTasks(originalTasks || []);
            console.error('Error updating task status:', error);
            toast.error('Failed to update task status');
        }
    };

    const handleEditTask = async (taskId: bigint, data: EditTaskFormData) => {
        try {
            setIsLoading(true);

            // Update task
            const { error: taskError } = await supabase
                .from('tasks')
                .update({
                    title: data.title,
                    description: data.description,
                    priority: data.priority,
                    due_date: data.due_date,
                    updated_at: new Date().toISOString()
                })
                .eq('id', taskId);

            if (taskError) throw taskError;

            // Update assignees
            const currentAssignees = editingTask?.task_assignments.map(ta => ta.assigned_to.id.toString()) || [];
            const newAssignees = data.assignees;

            // Remove assignees that are no longer selected
            const removedAssignees = currentAssignees.filter(id => !newAssignees.includes(id));
            if (removedAssignees.length > 0) {
                const { error: removeError } = await supabase
                    .from('task_assignments')
                    .delete()
                    .eq('task_id', taskId)
                    .in('assigned_to', removedAssignees);

                if (removeError) throw removeError;
            }

            // Add new assignees
            const addedAssignees = newAssignees.filter(id => !currentAssignees.includes(id));
            if (addedAssignees.length > 0) {
                const { error: addError } = await supabase
                    .from('task_assignments')
                    .insert(addedAssignees.map(assigneeId => ({
                        task_id: taskId,
                        assigned_to: assigneeId,
                        status: 'To Do',
                        progress: 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })));

                if (addError) throw addError;
            }

            // Refresh tasks
            const { data: updatedTasks, error: refreshError } = await supabase
                .from('tasks')
                .select(`
                    id,
                    title,
                    description,
                    department_id,
                    priority,
                    due_date,
                    start_date,
                    version,
                    created_at,
                    updated_at,
                    task_assignments(
                        id,
                        status,
                        progress,
                        comments,
                        started_at,
                        completed_at,
                        version,
                        assigned_to(
                            id,
                            display_name,
                            profile_picture,
                            job_title,
                            department_id,
                            role
                        )
                    ),
                    created_by_user:created_by(display_name)
                `)
                .eq('department_id', userData?.department_id);

            if (refreshError) throw refreshError;

            setTasks(updatedTasks || []);
            toast.success('Task updated successfully');

        } catch (error) {
            console.error('Error updating task:', error);
            toast.error('Failed to update task');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBulkStatusUpdate = async (newStatus: TaskStatus) => {
        if (isUpdating) return;
        setIsUpdating(true);

        try {
            const updates = Array.from(selectedTasks).map(async (taskId) => {
                const { error } = await supabase
                    .from('task_assignments')
                    .update({
                        status: newStatus,
                        updated_at: new Date().toISOString()
                    })
                    .eq('task_id', taskId);

                if (error) throw error;
            });

            await Promise.all(updates);
            toast.success(`Updated ${selectedTasks.size} tasks to ${newStatus}`);
            setSelectedTasks(new Set());
            await fetchTasks(); // Refresh tasks
        } catch (error) {
            console.error('Error updating tasks:', error);
            toast.error('Failed to update tasks: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleBulkAssign = async (userId: bigint) => {
        if (isUpdating) return;
        setIsUpdating(true);

        try {
            const updates = Array.from(selectedTasks).map(async (taskId) => {
                const { error } = await supabase
                    .from('task_assignments')
                    .update({
                        assigned_to: userId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('task_id', taskId);

                if (error) throw error;
            });

            await Promise.all(updates);
            toast.success('Tasks assigned successfully');
            setSelectedTasks(new Set());
            await fetchTasks(); // Refresh tasks
        } catch (error) {
            console.error('Error assigning tasks:', error);
            toast.error('Failed to assign tasks: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleExportTasks = () => {
        try {
            const selectedTasksData = tasks
                .filter(task => selectedTasks.has(task.id))
                .map(task => ({
                    Title: task.title,
                    Description: task.description || '',
                    Status: task.task_assignments[0]?.status || 'No Status',
                    Priority: task.priority,
                    DueDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date',
                    Assignees: task.task_assignments
                        .map(ta => ta.assigned_to.display_name)
                        .join('; ') || 'Unassigned',
                    Progress: `${task.task_assignments[0]?.progress || 0}%`,
                    CreatedBy: task.created_by_user.display_name,
                    CreatedAt: new Date(task.created_at).toLocaleDateString()
                }));

            if (selectedTasksData.length === 0) {
                toast.error('No tasks selected for export');
                return;
            }

            downloadCSV(selectedTasksData, `tasks-export-${new Date().toISOString().slice(0, 10)}.csv`);
            toast.success('Tasks exported successfully');
        } catch (error) {
            console.error('Error exporting tasks:', error);
            toast.error('Failed to export tasks');
        }
    };

    // Improved task selection handling
    const toggleTaskSelection = (taskId: bigint) => {
        setSelectedTasks(prev => {
            const newSelected = new Set(prev);
            if (newSelected.has(taskId)) {
                newSelected.delete(taskId);
            } else {
                newSelected.add(taskId);
            }
            return newSelected;
        });
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: { session }, error: authError } = await supabase.auth.getSession();

                if (authError || !session) {
                    toast.error('Please login first');
                    router.push('/');
                    return;
                }

                const storedUserData = sessionStorage.getItem('userData');
                const userData: User | null = storedUserData ? JSON.parse(storedUserData) : null;

                if (!userData || userData.role !== 'manager') {
                    toast.error('Unauthorized access');
                    router.push('/');
                    return;
                }

                setUserData(userData);

                if (userData.department_id) {
                    // Update query to match database schema
                    const { data: tasksData, error: tasksError } = await supabase
                        .from('tasks')
                        .select(`
                            id,
                            title,
                            description,
                            department_id,
                            priority,
                            due_date,
                            start_date,
                            version,
                            created_at,
                            updated_at,
                            task_assignments(
                                id,
                                status,
                                progress,
                                comments,
                                started_at,
                                completed_at,
                                version,
                                assigned_to(
                                    id,
                                    display_name,
                                    profile_picture,
                                    job_title,
                                    department_id,
                                    role
                                )
                            ),
                            created_by_user:created_by(display_name)
                        `)
                        .eq('department_id', userData.department_id);

                    if (tasksError) throw tasksError;
                    setTasks(tasksData || []);

                    // Update team members query
                    const { data: teamData, error: teamError } = await supabase
                        .from('users')
                        .select(`
                            id,
                            display_name,
                            profile_picture,
                            job_title,
                            role,
                            department_id
                        `)
                        .eq('department_id', userData.department_id)
                        .order('display_name');

                    if (teamError) throw teamError;
                    setTeamMembers(teamData || []);

                    // Fetch dependencies
                    const { data: dependenciesData, error: dependenciesError } = await supabase
                        .from('task_dependencies')
                        .select('*')
                        .in('task_id', (tasksData || []).map(t => t.id));

                    if (dependenciesError) throw dependenciesError;
                    setDependencies(dependenciesData || []);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
                toast.error('Failed to load department data');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [router]);

    // Filter tasks based on assignee
    const filteredTasks = tasks.filter(task => {
        return filterAssignee === 'all' ||
            task.task_assignments.some(ta => ta.assigned_to.id.toString() === filterAssignee);
    });

    // Use debouncedSearch instead of searchTerm for filtering
    const filteredTasksSearch = useMemo(() =>
        tasks.filter(task =>
            task.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            task.description?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            task.task_assignments.some(ta =>
                ta.assigned_to.display_name.toLowerCase().includes(debouncedSearch.toLowerCase())
            )
        ),
        [tasks, debouncedSearch]
    );

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="min-h-screen bg-slate-900 relative overflow-hidden">
                {/* Animated background with gradient and orbs */}
                <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10"></div>
                    <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-float-slow"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float-slower"></div>
                </div>

                {/* Main content */}
                <div className="relative z-10">
                    {/* Header */}
                    <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50">
                        <div className="container mx-auto px-4 py-4">
                            <div className="flex items-center justify-between">
                                <h1 className="text-2xl font-light text-white">Kanban Board</h1>
                                <button
                                    onClick={() => router.push('/manager/dashboard')}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors duration-300 flex items-center space-x-2"
                                >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M10 19l-7-7m0 0l7-7m-7 7h18"
                                        />
                                    </svg>
                                    <span>Back</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* Dashboard Content */}
                    <main className="container mx-auto px-4 py-8">
                        <TaskMetrics tasks={tasks} />
                        <TaskStats tasks={tasks} />

                        {/* Move filters up, before the search bar */}
                        <div className="flex items-center gap-4 mb-6">
                            <select
                                value={filterAssignee}
                                onChange={(e) => setFilterAssignee(e.target.value)}
                                className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 py-2 text-white"
                            >
                                <option value="all">All Team Members</option>
                                {teamMembers.map(member => (
                                    <option
                                        key={member.id}
                                        value={member.id}
                                        className="bg-slate-800"
                                    >
                                        {member.display_name} - {member.job_title}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Search tasks..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 py-2 text-white placeholder-slate-400"
                                />
                            </div>
                            <select
                                value={viewMode}
                                onChange={(e) => setViewMode(e.target.value as 'board' | 'timeline')}
                                className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 py-2 text-white"
                            >
                                <option value="board">Board View</option>
                                <option value="timeline">Timeline View</option>
                            </select>
                        </div>

                        {viewMode === 'board' ? (
                            <>
                                <DependencyGraph tasks={filteredTasks} dependencies={dependencies} />
                                <div className="grid grid-cols-4 gap-4">
                                    {['To Do', 'In Progress', 'Under Review', 'Completed'].map((status) => (
                                        <Column
                                            key={status}
                                            status={status}
                                            tasks={filteredTasks}
                                            onStatusChange={handleStatusChange}
                                            onEdit={setEditingTask}
                                        />
                                    ))}
                                </div>
                            </>
                        ) : (
                            <TimelineView tasks={filteredTasks} />
                        )}
                    </main>
                </div>

                {editingTask && (
                    <EditTaskForm
                        task={editingTask}
                        isOpen={!!editingTask}
                        onClose={() => setEditingTask(null)}
                        teamMembers={teamMembers}
                        onSubmit={handleEditTask}
                    />
                )}

                <BulkActions
                    selectedTasks={selectedTasks}
                    onClearSelection={() => setSelectedTasks(new Set())}
                    onUpdateStatus={handleBulkStatusUpdate}
                    onAssign={handleBulkAssign}
                    onExport={handleExportTasks}
                />
            </div>
        </DndProvider>
    );
}
