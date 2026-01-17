export interface AgentActivity {
  id: string;
  agent: string;
  agentId: string;
  action: string;
  status: 'complete' | 'working' | 'pending';
  workflowGoal?: string;
  timestamp: string;
  createdAt: Date;
}

export interface AgentStats {
  agentId: string;
  agentName: string;
  totalTasks: number;
  successfulTasks: number;
  successRate: number;
  avgQualityScore: number;
  avgExecutionTime: string;
  totalCost: string;
  lastActive: Date;
}

export interface Agent {
  id: string;
  name: string;
  division: string;
  description: string;
}

export interface AgentContribution {
  agent: string;
  contribution: string;
  score?: number;
}

export interface DeliverableAgents {
  deliverableId: string;
  type: string;
  workflowGoal: string;
  createdAt: Date;
  agents: AgentContribution[];
}
