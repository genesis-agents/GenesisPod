'use client';

import { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Activity,
  AlertCircle,
  Plus,
} from 'lucide-react';
import {
  getCollectionTasks,
  CollectionTask,
  executeTask,
} from '@/lib/api/data-collection';

interface ScheduleTask extends CollectionTask {
  cron?: string;
  nextRun?: string;
}

export default function SchedulerPage() {
  const [schedules, setSchedules] = useState<ScheduleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    async function fetchSchedules() {
      try {
        setLoading(true);
        const response = await getCollectionTasks();
        // Filter for tasks that could be scheduled (pending or completed tasks)
        const schedulableTasks = response.data.filter(
          (task) => task.status === 'PENDING' || task.status === 'COMPLETED'
        );
        setSchedules(schedulableTasks);
      } catch (err) {
        console.error('Failed to fetch schedules:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load schedules'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchSchedules();
  }, []);

  const handleRunTask = async (taskId: string) => {
    try {
      await executeTask(taskId);
      // Refresh the list
      const response = await getCollectionTasks();
      setSchedules(
        response.data.filter(
          (task) => task.status === 'PENDING' || task.status === 'COMPLETED'
        )
      );
    } catch (err) {
      console.error('Failed to execute task:', err);
      alert('Failed to execute task');
    }
  };

  // Prevent hydration mismatch by ensuring client-side only rendering
  if (!mounted || loading) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <div className="text-center">
          <Activity className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-2 text-sm text-gray-500">Loading schedules...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <p className="mt-2 text-sm text-gray-900">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Scheduled Tasks
          </h2>
          <p className="text-sm text-gray-500">
            {schedules.length} tasks available
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Create Task
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900">
            No scheduled tasks
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a new task to get started
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    {schedule.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {schedule.source?.name || 'Unknown source'}
                  </p>
                  {schedule.description && (
                    <p className="mt-1 text-sm text-gray-600">
                      {schedule.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-gray-600">
                      <Clock className="h-4 w-4" />
                      {schedule.cron || 'Manual execution'}
                    </span>
                    <span className="flex items-center gap-1 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      Status: {schedule.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      schedule.status === 'PENDING'
                        ? 'bg-gray-100 text-gray-700'
                        : schedule.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {schedule.status}
                  </span>
                  {schedule.status === 'PENDING' && (
                    <button
                      onClick={() => handleRunTask(schedule.id)}
                      className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
                      title="Run now"
                    >
                      <Play className="h-4 w-4 text-gray-700" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
