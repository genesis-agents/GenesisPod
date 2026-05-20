'use client';

import { useState, useEffect } from 'react';
import {
  TopicAIMemberWithTeamRole,
  CreateMissionDto,
} from '@/lib/types/ai-teams';
import { useAiGroupStore } from '@/stores/ai-teams';

interface CreateMissionDialogProps {
  topicId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateMissionDialog({
  topicId,
  onClose,
  onSuccess,
}: CreateMissionDialogProps) {
  const {
    teamMembers,
    isLoadingTeamMembers,
    fetchTeamMembers,
    setTeamLeader,
    createMission,
  } = useAiGroupStore();

  const [selectedLeaderId, setSelectedLeaderId] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure teamMembers is always an array
  const membersList = teamMembers || [];

  // Load team members on mount
  useEffect(() => {
    fetchTeamMembers(topicId);
  }, [topicId, fetchTeamMembers]);

  // Auto-select current leader if exists
  useEffect(() => {
    if (membersList.length === 0) return;
    const currentLeader = membersList.find((m) => m.isLeader);
    if (currentLeader && !selectedLeaderId) {
      setSelectedLeaderId(currentLeader.id);
    }
  }, [membersList, selectedLeaderId]);

  const handleSubmit = async () => {
    if (!selectedLeaderId || !taskDescription.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Set the leader first if changed
      const currentLeader = membersList.find((m) => m.isLeader);
      if (!currentLeader || currentLeader.id !== selectedLeaderId) {
        await setTeamLeader(topicId, selectedLeaderId);
      }

      // Create the mission
      const dto: CreateMissionDto = {
        title: taskDescription.trim().slice(0, 100),
        description: taskDescription.trim(),
        leaderId: selectedLeaderId,
        autoStart: true,
        ...(notificationEmail.trim() && {
          notificationEmail: notificationEmail.trim(),
        }),
      };

      await createMission(topicId, dto);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mission');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedLeader = membersList.find((m) => m.id === selectedLeaderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Create Team Mission
            </h2>
            <p className="text-sm text-gray-500">
              Assign a leader and describe the task
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Leader Selection */}
          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700">
              Select Team Leader
            </label>
            {isLoadingTeamMembers ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : membersList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
                <p className="text-sm text-gray-500">
                  No AI members in this topic. Please add AI members first.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {membersList.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => setSelectedLeaderId(member.id)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                      selectedLeaderId === member.id
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="relative">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-blue-100 text-2xl">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt=""
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          '🤖'
                        )}
                      </div>
                      {member.isLeader && (
                        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-xs">
                          👑
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900">
                        {member.agentName || member.displayName}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {member.roleDescription || member.aiModel}
                      </div>
                    </div>
                    {selectedLeaderId === member.id && (
                      <svg
                        className="h-5 w-5 flex-shrink-0 text-blue-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Task Description */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Task Description
            </label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={4}
              placeholder="Describe what you want the team to accomplish..."
              className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-2 text-xs text-gray-500">
              The leader will analyze this task and coordinate the team to
              complete it.
            </p>
          </div>

          {/* Notification Email */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Notification Email
              <span className="ml-1 text-xs font-normal text-gray-400">
                (Optional)
              </span>
            </label>
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="Enter email to receive completion notification"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-2 text-xs text-gray-500">
              When the mission completes, a report link will be sent to this
              email.
            </p>
          </div>

          {/* Preview */}
          {selectedLeader && taskDescription.trim() && (
            <div className="rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow-sm">
                  👑
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {selectedLeader.agentName || selectedLeader.displayName}{' '}
                    will lead this mission
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    The leader will analyze the task, assign work to team
                    members, and coordinate the execution until completion.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer - fixed at bottom */}
        <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !selectedLeaderId || !taskDescription.trim() || isSubmitting
            }
            className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2 text-sm font-medium text-white hover:from-blue-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Starting...
              </span>
            ) : (
              'Start Mission'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
