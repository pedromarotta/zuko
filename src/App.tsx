import Game from './components/Game.tsx';
import { ToastContainer } from 'react-toastify';
import CreateAgentModal from './components/CreateAgentModal.tsx';
import JoinModal from './components/JoinModal.tsx';
import { useState, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useServerGame } from './hooks/serverGame.ts';

export default function Home() {
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const userPlayerId =
    game && [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id;
  const isPlaying = !!userPlayerId;

  const playerName = userPlayerId
    ? game?.playerDescriptions.get(userPlayerId)?.name
    : undefined;

  const leave = useMutation(api.world.leaveWorld);

  const handleLeave = useCallback(() => {
    if (!worldId) return;
    void leave({ worldId });
  }, [worldId, leave]);

  return (
    <main className="relative w-screen h-screen overflow-hidden" style={{ background: '#1a1d2e' }}>
      <Game />

      {/* Top bar */}
      <header className="absolute top-0 left-0 w-full z-10 flex items-center justify-between px-4 py-2" style={{ background: 'rgba(26, 29, 46, 0.9)', borderBottom: '1px solid #2a2d3e' }}>
        <div className="text-white text-sm font-semibold">
          zukọ
        </div>
        <div className="text-gray-400 text-sm">
          {isPlaying ? `📍 ${playerName}'s location` : 'Spectating'}
        </div>
        <div className="text-gray-400 text-sm flex items-center gap-2">
          {game && (
            <span className="flex items-center gap-1">
              👥 {game.world.players.size}
            </span>
          )}
        </div>
      </header>

      {/* Bottom bar */}
      <footer className="absolute bottom-0 left-0 w-full z-10" style={{ background: 'rgba(26, 29, 46, 0.95)', borderTop: '1px solid #2a2d3e' }}>
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: avatar + name + status */}
          <div className="flex items-center gap-3">
            {isPlaying ? (
              <>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: '#2a2d3e' }}>
                  😊
                </div>
                <div>
                  <div className="text-white text-sm font-medium">{playerName}</div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: '#4ade80' }} />
                    <span className="text-xs" style={{ color: '#4ade80' }}>Available</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-500" />
                <span className="text-gray-400 text-sm">Spectating</span>
              </div>
            )}
          </div>

          {/* Center: action buttons */}
          <div className="flex gap-2">
            {isPlaying ? (
              <button
                onClick={handleLeave}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-all"
                style={{ background: '#2a2d3e', color: '#9ca3af' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#3a3d4e')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#2a2d3e')}
              >
                Leave
              </button>
            ) : (
              <button
                onClick={() => setShowJoin(true)}
                className="text-xs px-4 py-1.5 rounded-md font-semibold text-black transition-all"
                style={{ background: '#ffffff' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
              >
                Join as Human
              </button>
            )}
            <button
              onClick={() => setShowCreateAgent(true)}
              className="text-xs px-4 py-1.5 rounded-md font-semibold text-black transition-all"
              style={{ background: '#4ade80' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#22c55e')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#4ade80')}
            >
              + Create Agent
            </button>
          </div>

          {/* Right: player count */}
          <div className="flex items-center gap-3">
            {game && (
              <span className="text-gray-400 text-xs">
                👥 {[...game.world.players.values()].filter(p => !p.human).length} agents · {[...game.world.players.values()].filter(p => !!p.human).length} humans
              </span>
            )}
          </div>
        </div>
      </footer>

      {showJoin && <JoinModal onClose={() => setShowJoin(false)} />}
      {showCreateAgent && <CreateAgentModal onClose={() => setShowCreateAgent(false)} />}
      <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
    </main>
  );
}
