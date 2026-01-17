import { Users, Briefcase, Palette, TrendingUp, Code, CheckSquare } from 'lucide-react';
import { Agent } from '../types/agents';

interface AgentRosterProps {
  agents: Agent[];
}

const divisionIcons = {
  Creative: Palette,
  Marketing: TrendingUp,
  Design: Briefcase,
  Strategy: TrendingUp,
  Engineering: Code,
  Quality: CheckSquare,
};

const divisionColors = {
  Creative: 'bg-purple-100 text-purple-700 border-purple-200',
  Marketing: 'bg-blue-100 text-blue-700 border-blue-200',
  Design: 'bg-pink-100 text-pink-700 border-pink-200',
  Strategy: 'bg-green-100 text-green-700 border-green-200',
  Engineering: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Quality: 'bg-orange-100 text-orange-700 border-orange-200',
};

export function AgentRoster({ agents }: AgentRosterProps) {
  const divisions = Array.from(new Set(agents.map(a => a.division)));

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900">Agent Roster</h2>
        <span className="ml-auto text-sm text-gray-500">{agents.length} agents</span>
      </div>

      <div className="space-y-6">
        {divisions.map((division) => {
          const divisionAgents = agents.filter(a => a.division === division);
          const Icon = divisionIcons[division as keyof typeof divisionIcons] || Users;
          const colorClass = divisionColors[division as keyof typeof divisionColors] || 'bg-gray-100 text-gray-700 border-gray-200';

          return (
            <div key={division}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4 text-gray-600" />
                <h3 className="font-semibold text-gray-900">{division}</h3>
                <span className="text-xs text-gray-500">({divisionAgents.length})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {divisionAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`p-4 rounded-lg border ${colorClass} hover:shadow-md transition-shadow`}
                  >
                    <p className="font-medium mb-1">{agent.name}</p>
                    <p className="text-xs opacity-80">{agent.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
