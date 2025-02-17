'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import { gapi } from 'gapi-script';
import { supabase } from '@/app/supabaseClient';


// Google Calendar API configuration
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY!;
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events';

interface Task {
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    start_date: string | null;
}

interface CalendarEvent {
    id: string;
    task_id: string;
    external_id: string;
    title: string;
    start_time: string;
    end_time: string;
}

export default function CalendarView() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSignedIn, setIsSignedIn] = useState(false);
    const [calendarId, setCalendarId] = useState<string>('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showEventList, setShowEventList] = useState(false);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const initializeGoogleAPI = async () => {
            try {
                // First, load the gapi client
                await new Promise<void>((resolve, reject) => {
                    gapi.load('client', {
                        callback: resolve,
                        onerror: reject,
                    });
                });

                // Initialize the client with API key and client ID
                await gapi.client.init({
                    apiKey: GOOGLE_API_KEY,
                    discoveryDocs: [DISCOVERY_DOC],
                });

                // Load and initialize auth2
                await new Promise<void>((resolve, reject) => {
                    gapi.load('auth2', {
                        callback: async () => {
                            try {
                                await gapi.auth2.init({
                                    client_id: GOOGLE_CLIENT_ID,
                                    scope: SCOPES,
                                });
                                resolve();
                            } catch (error) {
                                reject(error);
                            }
                        },
                        onerror: reject,
                    });
                });

                // Get auth instance and set up listeners
                const authInstance = gapi.auth2.getAuthInstance();
                if (authInstance) {
                    // Update initial sign-in status
                    setIsSignedIn(authInstance.isSignedIn.get());

                    // Listen for sign-in state changes
                    authInstance.isSignedIn.listen((signedIn: boolean) => {
                        setIsSignedIn(signedIn);
                        if (signedIn) {
                            getCalendarId();
                        }
                    });

                    // If already signed in, get calendar ID
                    if (authInstance.isSignedIn.get()) {
                        getCalendarId();
                    }
                }

            } catch (error) {
                console.error('Detailed initialization error:', error);
                if (error instanceof Error) {
                    toast.error(`Failed to initialize Google services: ${error.message}`);
                } else {
                    toast.error('Failed to initialize Google services');
                }
            } finally {
                setIsLoading(false);
            }
        };

        initializeGoogleAPI();
    }, []);

    const getCalendarId = async () => {
        try {
            const response = await gapi.client.calendar.calendarList.list();
            const primaryCalendar = response.result.items?.find(cal => cal.primary);
            if (primaryCalendar) {
                setCalendarId(primaryCalendar.id);
            }
        } catch (error) {
            console.error('Error getting calendar ID:', error);
            toast.error('Failed to load calendar');
        }
    };

    const handleAuthClick = async () => {
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            if (authInstance) {
                await authInstance.signIn();
            }
        } catch (error) {
            console.error('Error signing in:', error);
            toast.error('Failed to sign in with Google');
        }
    };

    const handleSignoutClick = async () => {
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            if (authInstance) {
                await authInstance.signOut();
                setCalendarId('');
            }
        } catch (error) {
            console.error('Error signing out:', error);
            toast.error('Failed to sign out');
        }
    };

    const deleteCalendarEvent = async (taskId: string) => {
        try {
            // First get the calendar event from the database
            const { data: calendarEvent, error: fetchError } = await supabase
                .from('calendar_events')
                .select('external_id')
                .eq('task_id', taskId)
                .eq('service_type', 'google')
                .single();

            if (fetchError) {
                console.error('Error fetching calendar event:', fetchError);
                throw fetchError;
            }

            if (calendarEvent) {
                // Delete from Google Calendar
                try {
                    await gapi.client.calendar.events.delete({
                        calendarId: 'primary',
                        eventId: calendarEvent.external_id,
                    });
                } catch (error) {
                    console.error('Error deleting from Google Calendar:', error);
                    // Continue with database deletion even if Google Calendar deletion fails
                }

                // Delete from database
                const { error: deleteError } = await supabase
                    .from('calendar_events')
                    .delete()
                    .eq('task_id', taskId)
                    .eq('service_type', 'google');

                if (deleteError) {
                    console.error('Error deleting from database:', deleteError);
                    throw deleteError;
                }

                toast.success('Calendar event deleted successfully');
            } else {
                toast('No calendar event found for this task', {
                    icon: 'ℹ️',
                });
            }
        } catch (error) {
            console.error('Error deleting calendar event:', error);
            if (error instanceof Error) {
                toast.error(`Failed to delete calendar event: ${error.message}`);
            } else {
                toast.error('Failed to delete calendar event');
            }
        }
    };

    // Add listener for task status changes
    useEffect(() => {
        const taskStatusChannel = supabase
            .channel('task-status-changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'task_assignments',
                    filter: 'status=eq.Completed'
                },
                async (payload) => {
                    // When a task is marked as completed, delete its calendar event
                    if (payload.new.status === 'Completed') {
                        await deleteCalendarEvent(payload.new.task_id);
                    }
                }
            )
            .subscribe();

        return () => {
            taskStatusChannel.unsubscribe();
        };
    }, []);

    // Add listener for task deletions
    useEffect(() => {
        const taskDeletionChannel = supabase
            .channel('task-deletions')
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'tasks'
                },
                async (payload) => {
                    // When a task is deleted, delete its calendar event
                    await deleteCalendarEvent(payload.old.id);
                }
            )
            .subscribe();

        return () => {
            taskDeletionChannel.unsubscribe();
        };
    }, []);

    const syncTasksToCalendar = async () => {
        if (!isSignedIn || !calendarId) {
            toast.error('Please sign in to sync tasks');
            return;
        }

        setIsSyncing(true);
        try {
            // First get the authenticated user's ID
            const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
            if (authError) throw authError;
            if (!authUser) throw new Error('Not authenticated');

            // Then get the user data from the users table
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('id, email, role')
                .eq('auth_uid', authUser.id)
                .single();

            if (userError) {
                console.error('Error fetching user data:', userError);
                throw userError;
            }
            if (!userData) {
                throw new Error('User not found in database');
            }

            console.log('Current user:', userData); // Debug log

            // Get tasks assigned to the user using the database user ID
            const { data: assignments, error: assignmentsError } = await supabase
                .from('task_assignments')
                .select(`
                    task_id,
                    tasks (
                        id,
                        title,
                        description,
                        due_date,
                        start_date
                    )
                `)
                .eq('assigned_to', userData.id)
                .not('status', 'eq', 'Completed');

            if (assignmentsError) {
                console.error('Error fetching assignments:', assignmentsError);
                throw assignmentsError;
            }

            if (!assignments || assignments.length === 0) {
                toast('No tasks found to sync', {
                    icon: 'ℹ️',
                });
                return;
            }

            // Get existing calendar events for these tasks
            const { data: existingEvents, error: eventsError } = await supabase
                .from('calendar_events')
                .select('task_id, external_id')
                .eq('user_id', userData.id)
                .eq('service_type', 'google');

            if (eventsError) {
                console.error('Error fetching existing events:', eventsError);
                throw eventsError;
            }

            console.log('Existing events:', existingEvents); // Debug log

            const existingEventMap = new Map(
                existingEvents?.map(event => [event.task_id, event.external_id]) || []
            );

            // Ensure calendar API is loaded
            if (!gapi.client.calendar) {
                await gapi.client.load('calendar', 'v3');
            }

            let syncedCount = 0;
            // Process each task
            for (const assignment of assignments) {
                const task = assignment.tasks as Task;
                if (!task.due_date && !task.start_date) {
                    console.log('Skipping task without dates:', task); // Debug log
                    continue;
                }

                try {
                    // Use the later date if both are available, or whichever is available
                    const startDate = new Date(task.start_date || task.due_date);
                    const endDate = new Date(task.due_date || task.start_date);

                    // Add one hour to end date if same as start date
                    if (endDate.getTime() === startDate.getTime()) {
                        endDate.setHours(endDate.getHours() + 1);
                    }

                    // If no existing event, create new one
                    if (!existingEventMap.has(task.id)) {
                        console.log('Creating new event for task:', task); // Debug log

                        const event = {
                            summary: task.title,
                            description: task.description || '',
                            start: {
                                dateTime: startDate.toISOString(),
                                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                            },
                            end: {
                                dateTime: endDate.toISOString(),
                                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                            }
                        };

                        // Create event in Google Calendar
                        const response = await gapi.client.calendar.events.insert({
                            calendarId: 'primary',
                            resource: event,
                        });

                        console.log('Google Calendar response:', response); // Debug log

                        // Store the mapping in calendar_events table
                        const { error: insertError } = await supabase
                            .from('calendar_events')
                            .insert({
                                task_id: task.id,
                                user_id: userData.id, // Using the database user ID
                                external_id: response.result.id,
                                start_time: startDate.toISOString(),
                                end_time: endDate.toISOString(),
                                service_type: 'google',
                                sync_token: response.result.etag,
                                last_synced: new Date().toISOString()
                            });

                        if (insertError) {
                            console.error('Error inserting calendar event:', insertError);
                            throw insertError;
                        }

                        syncedCount++;
                    }
                } catch (error) {
                    console.error('Error processing task:', task, error);
                    // Continue with other tasks even if one fails
                }
            }

            // Add handling for deleted tasks
            const taskIds = assignments.map(a => a.task_id);
            const { data: obsoleteEvents, error: obsoleteError } = await supabase
                .from('calendar_events')
                .select('task_id')
                .eq('user_id', userData.id)
                .eq('service_type', 'google')
                .not('task_id', 'in', `(${taskIds.join(',')})`);

            if (!obsoleteError && obsoleteEvents) {
                for (const event of obsoleteEvents) {
                    await deleteCalendarEvent(event.task_id);
                }
            }

            if (syncedCount > 0) {
                toast.success(`Successfully synced ${syncedCount} tasks`);
            } else {
                toast('No new tasks to sync', {
                    icon: 'ℹ️',
                });
            }

        } catch (error) {
            console.error('Detailed sync error:', error);
            if (error instanceof Error) {
                toast.error(`Failed to sync tasks: ${error.message}`);
            } else {
                toast.error('Failed to sync tasks');
            }
        } finally {
            setIsSyncing(false);
        }
    };

    const handleEventClick = async (event: any) => {
        // Get the calendar event details from our database
        const { data: calendarEvent, error } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('external_id', event.id)
            .single();

        if (error) {
            console.error('Error fetching event details:', error);
            return;
        }

        setSelectedEvent({
            id: event.id,
            title: event.summary,
            start: new Date(event.start.dateTime || event.start.date),
            end: new Date(event.end.dateTime || event.end.date),
            description: event.description,
            task_id: calendarEvent?.task_id,
            external_id: calendarEvent?.external_id
        });
        setShowDeleteModal(true);
    };

    const handleManualDelete = async () => {
        if (!selectedEvent) return;

        try {
            // Delete from Google Calendar
            try {
                await gapi.client.calendar.events.delete({
                    calendarId: 'primary',
                    eventId: selectedEvent.external_id,
                });
            } catch (error) {
                console.error('Error deleting from Google Calendar:', error);
                toast.error('Failed to delete from Google Calendar');
                return;
            }

            // Delete from database
            const { error: dbError } = await supabase
                .from('calendar_events')
                .delete()
                .eq('external_id', selectedEvent.external_id);

            if (dbError) {
                console.error('Error deleting from database:', dbError);
                throw dbError;
            }

            toast.success('Event deleted successfully');
            setShowDeleteModal(false);
            setSelectedEvent(null);

        } catch (error) {
            console.error('Error in manual deletion:', error);
            toast.error('Failed to delete event');
        }
    };

    const getCalendarUrl = () => {
        if (!calendarId) return '';

        const baseUrl = 'https://calendar.google.com/calendar/embed';
        const params = new URLSearchParams({
            src: calendarId,
            ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            mode: 'WEEK', // You can change this to MONTH, AGENDA, etc.
            showTitle: '0',
            showNav: '1',
            showDate: '1',
            showPrint: '0',
            showTabs: '1',
            showCalendars: '1',
            showTz: '1',
        });

        return `${baseUrl}?${params.toString()}`;
    };

    // Instead of trying to handle events in the iframe, 
    // let's add a button to open the event in Google Calendar
    const openInGoogleCalendar = () => {
        if (!calendarId) return;

        const calendarUrl = `https://calendar.google.com/calendar/r?pli=1`;
        window.open(calendarUrl, '_blank');
    };

    const fetchCalendarEvents = async () => {
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) throw new Error('Not authenticated');

            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('auth_uid', authUser.id)
                .single();

            if (!userData) throw new Error('User not found');

            const { data: calendarEvents, error } = await supabase
                .from('calendar_events')
                .select(`
                    id,
                    task_id,
                    external_id,
                    start_time,
                    end_time,
                    tasks (
                        title
                    )
                `)
                .eq('user_id', userData.id)
                .eq('service_type', 'google');

            if (error) throw error;

            setEvents(calendarEvents.map(event => ({
                id: event.id,
                task_id: event.task_id,
                external_id: event.external_id,
                title: event.tasks.title,
                start_time: event.start_time,
                end_time: event.end_time
            })));
        } catch (error) {
            console.error('Error fetching events:', error);
            toast.error('Failed to load calendar events');
        }
    };

    const refreshCalendar = () => {
        if (iframeRef.current) {
            // Reload the iframe by updating its src
            const currentSrc = iframeRef.current.src;
            iframeRef.current.src = '';
            setTimeout(() => {
                if (iframeRef.current) {
                    iframeRef.current.src = currentSrc;
                }
            }, 100);
        }
    };

    const handleDeleteEvent = async (event: CalendarEvent) => {
        try {
            // Delete from Google Calendar
            await gapi.client.calendar.events.delete({
                calendarId: 'primary',
                eventId: event.external_id,
            });

            // Delete from database
            const { error } = await supabase
                .from('calendar_events')
                .delete()
                .eq('external_id', event.external_id);

            if (error) throw error;

            // Update local state
            setEvents(events.filter(e => e.id !== event.id));
            toast.success('Event deleted successfully');

            // Refresh the calendar iframe
            refreshCalendar();

            // Close the modal after successful deletion
            setShowEventList(false);
        } catch (error) {
            console.error('Error deleting event:', error);
            toast.error('Failed to delete event');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <>
            <Toaster position="top-right" />
            <div className="min-h-screen bg-slate-900 relative overflow-hidden">
                {/* Background gradients */}
                <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-blue-500/5"></div>
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float-slow"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-[32rem] h-[32rem] bg-purple-500/10 rounded-full blur-3xl animate-float-slower"></div>
                </div>

                {/* Main content */}
                <div className="relative z-10">
                    {/* Enhanced header */}
                    <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50">
                        <div className="container mx-auto px-6 py-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-3xl font-light text-white mb-2">Calendar View</h1>
                                </div>
                                <div className="flex items-center gap-4">
                                    {isSignedIn ? (
                                        <>
                                            <button
                                                onClick={syncTasksToCalendar}
                                                disabled={isSyncing}
                                                className="px-5 py-2.5 bg-green-600/90 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSyncing ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                        <span>Syncing...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                        <span>Sync Tasks</span>
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowEventList(true);
                                                    fetchCalendarEvents();
                                                }}
                                                className="px-5 py-2.5 bg-blue-600/90 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                                <span>Manage Events</span>
                                            </button>
                                            <button
                                                onClick={handleSignoutClick}
                                                className="px-5 py-2.5 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors"
                                            >
                                                Sign Out
                                            </button>
                                            <button
                                                onClick={() => router.push('/personnel/dashboard')}
                                                className="px-5 py-2.5 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                <span>Back</span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={handleAuthClick}
                                                className="px-5 py-2.5 bg-blue-600/90 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                Sign in with Google
                                            </button>
                                            <button
                                                onClick={() => router.push('/personnel/dashboard')}
                                                className="px-5 py-2.5 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                <span>Back</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Calendar container */}
                    <div className="container mx-auto px-6 py-8">
                        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 border border-slate-700/50 h-[calc(100vh-200px)]">
                            {isSignedIn && calendarId ? (
                                <iframe
                                    ref={iframeRef}
                                    src={getCalendarUrl()}
                                    style={{ border: 0 }}
                                    width="100%"
                                    height="100%"
                                    frameBorder="0"
                                    scrolling="no"
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400">
                                    Please sign in to view your calendar
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && selectedEvent && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800/90 backdrop-blur-xl rounded-2xl p-6 max-w-lg w-full mx-4 border border-slate-700/50 shadow-2xl">
                        <div className="flex justify-between items-start mb-6">
                            <h2 className="text-xl font-semibold text-white">Delete Event</h2>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <p className="text-slate-300">
                                Are you sure you want to delete this event?
                            </p>
                            <div className="font-medium text-slate-300">
                                <p>Event: {selectedEvent.title}</p>
                                <p className="text-sm text-slate-400">
                                    {new Date(selectedEvent.start_time).toLocaleString()} - {new Date(selectedEvent.end_time).toLocaleString()}
                                </p>
                            </div>

                            <div className="flex gap-4 justify-end mt-6">
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleManualDelete}
                                    className="px-4 py-2 bg-red-600/90 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete Event
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Event List Modal */}
            <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 ${showEventList ? 'flex' : 'hidden'} items-center justify-center p-4`}>
                <div className="bg-slate-800/90 backdrop-blur-xl rounded-2xl p-6 max-w-4xl w-full mx-4 border border-slate-700/50 shadow-2xl">
                    <div className="flex justify-between items-start mb-6">
                        <h2 className="text-xl font-semibold text-white">Manage Calendar Events</h2>
                        <button
                            onClick={() => setShowEventList(false)}
                            className="text-slate-400 hover:text-white transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                        {events.length > 0 ? (
                            events.map(event => (
                                <div key={event.id} className="bg-slate-700/30 rounded-lg p-4 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-white font-medium">{event.title}</h3>
                                        <p className="text-sm text-slate-400">
                                            {new Date(event.start_time).toLocaleString()} - {new Date(event.end_time).toLocaleString()}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteEvent(event)}
                                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                                        title="Delete event"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-slate-400 py-8">
                                No calendar events found
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
