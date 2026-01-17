import { TrendingUp, Target, Clock, DollarSign } from 'lucide-react';
import { AgentStats } from '../types/agents';

interface AgentStatsCardsProps {
  stats: AgentStats[];
}

export function AgentStatsCards({ stats }: AgentStatsCardsProps) {
  const topPerformers = stats
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 3);

  const totalTasks = stats.reduce((sum, s) => sum + s.totalTasks, 0);
  const avgSuccessRate = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.successRate, 0) / stats.length)
    : 0;
  const totalCost = stats.reduce((sum, s) => sum + parseFloat(s.totalCost), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{stats.length}</span>
          </div>
          <p className="text-sm opacity-90">Active Agents</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{totalTasks}</span>
          </div>
          <p className="text-sm opacity-90">Tasks Completed</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{avgSuccessRate}%</span>
          </div>
          <p className="text-sm opacity-90">Success Rate</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">${totalCost.toFixed(2)}</span>
          </div>
          <p className="text-sm opacity-90">Total Cost</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          Top Performers
        </h3>

        <div className="space-y-4">
          {topPerformers.map((agent, index) => (
            <div
              key={agent.agentId}
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{agent.agentName}</p>
                  <p className="text-xs text-gray-500">
                    {agent.totalTasks} tasks • Quality: {agent.avgQualityScore}/100
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-2 text-green-600 font-semibold">
                  <TrendingUp className="w-4 h-4" />
                  {agent.successRate}%
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                  <Clock className="w-3 h-3" />
                  {agent.avgExecutionTime}
                </div>
              </div>
            </div>
          ))}

          {topPerformers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No performance data yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
