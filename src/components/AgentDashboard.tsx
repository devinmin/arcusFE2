import { useState } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import { AgentActivityFeed } from './AgentActivityFeed';
import { AgentStatsCards } from './AgentStatsCards';
import { AgentRoster } from './AgentRoster';
import { mockActivities, mockStats, mockAgentRoster } from '../data/mockAgentData';

export function AgentDashboard() {
  const [activities] = useState(mockActivities);
  const [stats] = useState(mockStats);
  const [roster] = useState(mockAgentRoster);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Agent Command Center</h1>
                <p className="text-gray-600 mt-1">Monitor and manage your AI workforce</p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-8">
          <AgentStatsCards stats={stats} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AgentActivityFeed activities={activities} />
          <AgentRoster agents={roster} />
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Demo Mode:</strong> This dashboard is displaying mock data.
            Connect to your backend at <code className="bg-blue-100 px-2 py-0.5 rounded">src/api/agents.ts</code> to see real agent activity.
          </p>
        </div>
      </div>
    </div>
  );
}
