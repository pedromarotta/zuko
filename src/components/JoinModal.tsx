import { useState, useCallback } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ConvexError } from 'convex/values';
import { toast } from 'react-toastify';
import { waitForInput } from '../hooks/sendInput';

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

export default function JoinModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [character, setCharacter] = useState('f1');
  const [joining, setJoining] = useState(false);

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const join = useMutation(api.world.joinWorld);
  const convex = useConvex();

  const handleJoin = useCallback(async () => {
    if (!worldStatus?.worldId || !name.trim()) return;
    setJoining(true);
    try {
      const inputId = await join({
        worldId: worldStatus.worldId,
        name: name.trim(),
        character,
      });
      await waitForInput(convex, inputId);
      onClose();
    } catch (e: any) {
      if (e instanceof ConvexError) {
        toast.error(e.data);
      } else {
        toast.error(e.message);
      }
      setJoining(false);
    }
  }, [worldStatus, name, character, join, convex, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl w-full max-w-md p-6 text-white">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Join the World</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pedro"
            className="w-full bg-[#0d0f1a] border border-[#2a2d3e] rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white"
            maxLength={30}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        {/* Avatar picker */}
        <div className="mb-6">
          <label className="block text-sm text-gray-300 mb-2">Pick your Avatar</label>
          <div className="flex gap-2">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                onClick={() => setCharacter(a.id)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all ${
                  character === a.id
                    ? 'bg-white scale-110'
                    : 'bg-[#0d0f1a] border border-[#2a2d3e] hover:border-white'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Join button */}
        <button
          onClick={handleJoin}
          disabled={joining || !name.trim()}
          className="w-full py-3 rounded-lg font-semibold text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-gray-100"
        >
          {joining ? 'Joining...' : 'Enter World'}
        </button>
      </div>
    </div>
  );
}
