import { ObjectType, v } from 'convex/values';
import { GameId, agentId, parseGameId } from './ids';

export type AgentType = 'builtin' | 'webhook' | 'managed';

export class AgentDescription {
  agentId: GameId<'agents'>;
  identity: string;
  plan: string;
  type: AgentType;
  webhookUrl?: string;
  webhookAuthToken?: string;
  anthropicApiKey?: string;
  managedAgentId?: string;

  constructor(serialized: SerializedAgentDescription) {
    const { agentId, identity, plan, type, webhookUrl, webhookAuthToken, anthropicApiKey, managedAgentId } = serialized;
    this.agentId = parseGameId('agents', agentId);
    this.identity = identity;
    this.plan = plan;
    this.type = (type as AgentType) || 'builtin';
    this.webhookUrl = webhookUrl;
    this.webhookAuthToken = webhookAuthToken;
    this.anthropicApiKey = anthropicApiKey;
    this.managedAgentId = managedAgentId;
  }

  serialize(): SerializedAgentDescription {
    const { agentId, identity, plan, type, webhookUrl, webhookAuthToken, anthropicApiKey, managedAgentId } = this;
    return { agentId, identity, plan, type, webhookUrl, webhookAuthToken, anthropicApiKey, managedAgentId };
  }
}

export const serializedAgentDescription = {
  agentId,
  identity: v.string(),
  plan: v.string(),
  type: v.optional(v.string()),
  webhookUrl: v.optional(v.string()),
  webhookAuthToken: v.optional(v.string()),
  anthropicApiKey: v.optional(v.string()),
  managedAgentId: v.optional(v.string()),
};
export type SerializedAgentDescription = ObjectType<typeof serializedAgentDescription>;
