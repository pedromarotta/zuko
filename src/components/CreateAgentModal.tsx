import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const AVATARS = [
  { id: 'f1', label: '🟢' },
  { id: 'f2', label: '🔵' },
  { id: 'f3', label: '🟣' },
  { id: 'f4', label: '🟤' },
  { id: 'f5', label: '🟠' },
  { id: 'f6', label: '🔴' },
  { id: 'f7', label: '⚪' },
  { id: 'f8', label: '🟡' },
];

type AgentType = 'builtin' | 'webhook' | 'managed';

const TABS: { id: AgentType; label: string; color: string }[] = [
  { id: 'builtin', label: 'Built-in AI', color: '#4ade80' },
  { id: 'managed', label: 'Claude Agent', color: '#f97316' },
  { id: 'webhook', label: 'External', color: '#818cf8' },
];

export default function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('builtin');
  const [personality, setPersonality] = useState('');
  const [goal, setGoal] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookAuthToken, setWebhookAuthToken] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [managedAgentId, setManagedAgentId] = useState('');
  const [character, setCharacter] = useState('f1');
  const [creating, setCreating] = useState(false);

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const createAgent = useMutation(api.world.createAgent);

  const currentTab = TABS.find((t) => t.id === agentType)!;

  const isValid =
    name.trim() &&
    (agentType === 'builtin'
      ? personality.trim()
      : agentType === 'managed'
        ? anthropicApiKey.trim() && managedAgentId.trim()
        : webhookUrl.trim());

  const handleCreate = async () => {
    if (!worldStatus?.worldId || !isValid) return;
    setCreating(true);
    try {
      await createAgent({
        worldId: worldStatus.worldId,
        name: name.trim(),
        character,
        identity:
          agentType === 'builtin'
            ? personality.trim()
            : agentType === 'managed'
              ? 'Claude Managed Agent'
              : 'External agent connected via webhook',
        plan:
          agentType === 'builtin'
            ? goal.trim() || 'Be helpful and friendly.'
            : 'Respond via external brain.',
        type: agentType,
        webhookUrl: agentType === 'webhook' ? webhookUrl.trim() : undefined,
        webhookAuthToken:
          agentType === 'webhook' && webhookAuthToken.trim() ? webhookAuthToken.trim() : undefined,
        anthropicApiKey: agentType === 'managed' ? anthropicApiKey.trim() : undefined,
        managedAgentId: agentType === 'managed' ? managedAgentId.trim() : undefined,
      });
      onClose();
    } catch (e) {
      console.error('Failed to create agent:', e);
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="rounded-xl w-full max-w-md p-6 text-white"
        style={{ background: '#1a1d2e', border: '1px solid #2a2d3e' }}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">Create an Agent</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Type tabs */}
        <div className="flex rounded-lg mb-4 p-0.5" style={{ background: '#0d0f1a' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAgentType(tab.id)}
              className="flex-1 py-2 text-xs font-medium rounded-md transition-all"
              style={{
                background: agentType === tab.id ? tab.color : 'transparent',
                color: agentType === tab.id ? 'black' : '#9ca3af',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Name */}
        <div className="mb-3">
          <label className="block text-xs text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ada"
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
            style={{ background: '#0d0f1a', border: '1px solid #2a2d3e' }}
            maxLength={30}
          />
        </div>

        {/* Type-specific fields */}
        {agentType === 'builtin' && (
          <>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Personality</label>
              <textarea
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="Describe who this agent is..."
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none h-20 resize-none"
                style={{ background: '#0d0f1a', border: '1px solid #2a2d3e' }}
                maxLength={500}
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Goal (optional)</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Help people with coding questions"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
                style={{ background: '#0d0f1a', border: '1px solid #2a2d3e' }}
                maxLength={200}
              />
            </div>
          </>
        )}

        {agentType === 'managed' && (
          <>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Anthropic API Key</label>
              <input
                type="password"
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none font-mono"
                style={{ background: '#0d0f1a', border: '1px solid #2a2d3e' }}
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Agent ID</label>
              <input
                type="text"
                value={managedAgentId}
                onChange={(e) => setManagedAgentId(e.target.value)}
                placeholder="agent_..."
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none font-mono"
                style={{ background: '#0d0f1a', border: '1px solid #2a2d3e' }}
              />
            </div>
            <div
              className="mb-3 text-xs text-gray-500 rounded-lg p-3"
              style={{ background: '#0d0f1a' }}
            >
              Paste your Managed Agent ID from{' '}
              <span className="text-gray-300">console.anthropic.com</span>. Your agent&apos;s
              tools, personality, and skills will work automatically in zukọ.
            </div>
          </>
        )}

        {agentType === 'webhook' && (
          <>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Webhook URL</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-agent.example.com/respond"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none font-mono"
                style={{ background: '#0d0f1a', border: '1px solid #2a2d3e' }}
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Auth Token (optional)</label>
              <input
                type="password"
                value={webhookAuthToken}
                onChange={(e) => setWebhookAuthToken(e.target.value)}
                placeholder="Bearer token for your endpoint"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none font-mono"
                style={{ background: '#0d0f1a', border: '1px solid #2a2d3e' }}
              />
            </div>
            <div
              className="mb-3 text-xs text-gray-500 rounded-lg p-3"
              style={{ background: '#0d0f1a' }}
            >
              Your endpoint receives POST with context and returns{' '}
              <code className="text-gray-300">{`{ text }`}</code>
            </div>
          </>
        )}

        {/* Avatar picker */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-2">Avatar</label>
          <div className="flex gap-2">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                onClick={() => setCharacter(a.id)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-base transition-all"
                style={{
                  background: character === a.id ? currentTab.color : '#0d0f1a',
                  border: character === a.id ? 'none' : '1px solid #2a2d3e',
                  transform: character === a.id ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={creating || !isValid}
          className="w-full py-2.5 rounded-lg font-semibold text-sm text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: currentTab.color }}
        >
          {creating ? 'Creating...' : 'Create Agent'}
        </button>
      </div>
    </div>
  );
}
