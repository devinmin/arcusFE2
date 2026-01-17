import { Activity, CheckCircle2, Clock } from 'lucide-react';
import { AgentActivity } from '../types/agents';

interface AgentActivityFeedProps {
  activities: AgentActivity[];
}

export function AgentActivityFeed({ activities }: AgentActivityFeedProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900">Agent Activity</h2>
      </div>

      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
          >
            <div className="flex-shrink-0">
              {activity.status === 'complete' ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <Clock className="w-6 h-6 text-blue-500 animate-pulse" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-900">{activity.agent}</span>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    activity.status === 'complete'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {activity.status}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-1">{activity.action}</p>

              {activity.workflowGoal && (
                <p className="text-xs text-gray-500 italic">
                  Goal: {activity.workflowGoal}
                </p>
              )}

              <p className="text-xs text-gray-400 mt-2">{activity.timestamp}</p>
            </div>
          </div>
        ))}

        {activities.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No recent activity</p>
          </div>
        )}
      </div>
    </div>
  );
}
