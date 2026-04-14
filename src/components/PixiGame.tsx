import * as PIXI from 'pixi.js';
import { useApp } from '@pixi/react';
import { Player, SelectElement } from './Player.tsx';
import { useEffect, useRef, useState } from 'react';
import { PixiStaticMap } from './PixiStaticMap.tsx';
import PixiViewport from './PixiViewport.tsx';
import { Viewport } from 'pixi-viewport';
import { Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api.js';
import { useSendInput } from '../hooks/sendInput.ts';
import { toastOnError } from '../toasts.ts';
import { DebugPath } from './DebugPath.tsx';
import { PositionIndicator } from './PositionIndicator.tsx';
import { SHOW_DEBUG_UI } from './Game.tsx';
import { ServerGame } from '../hooks/serverGame.ts';

export const PixiGame = (props: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  historicalTime: number | undefined;
  width: number;
  height: number;
  setSelectedElement: SelectElement;
}) => {
  // PIXI setup.
  const pixiApp = useApp();
  const viewportRef = useRef<Viewport | undefined>();

  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId: props.worldId }) ?? null;
  const humanPlayerId = [...props.game.world.players.values()].find(
    (p) => p.human === humanTokenIdentifier,
  )?.id;

  const moveTo = useSendInput(props.engineId, 'moveTo');

  // Interaction for clicking on the world to navigate.
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const onMapPointerDown = (e: any) => {
    // https://pixijs.download/dev/docs/PIXI.FederatedPointerEvent.html
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
  };

  const [lastDestination, setLastDestination] = useState<{
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const onMapPointerUp = async (e: any) => {
    if (dragStart.current) {
      const { screenX, screenY } = dragStart.current;
      dragStart.current = null;
      const [dx, dy] = [screenX - e.screenX, screenY - e.screenY];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        console.log(`Skipping navigation on drag event (${dist}px)`);
        return;
      }
    }
    if (!humanPlayerId) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const gameSpacePx = viewport.toWorld(e.screenX, e.screenY);
    const tileDim = props.game.worldMap.tileDim;
    const gameSpaceTiles = {
      x: gameSpacePx.x / tileDim,
      y: gameSpacePx.y / tileDim,
    };
    setLastDestination({ t: Date.now(), ...gameSpaceTiles });
    const roundedTiles = {
      x: Math.floor(gameSpaceTiles.x),
      y: Math.floor(gameSpaceTiles.y),
    };
    console.log(`Moving to ${JSON.stringify(roundedTiles)}`);
    await toastOnError(moveTo({ playerId: humanPlayerId, destination: roundedTiles }));
  };
  const { width, height, tileDim } = props.game.worldMap;
  const players = [...props.game.world.players.values()];

  // Zoom on the user's avatar when it is created
  useEffect(() => {
    if (!viewportRef.current || humanPlayerId === undefined) return;

    const humanPlayer = props.game.world.players.get(humanPlayerId)!;
    viewportRef.current.animate({
      position: new PIXI.Point(humanPlayer.position.x * tileDim, humanPlayer.position.y * tileDim),
      scale: 1.5,
    });
  }, [humanPlayerId]);

  // Arrow key / WASD movement — sends destination ahead in pressed direction
  // so the pathfinding system creates a smooth interpolated path.
  const keysDown = useRef(new Set<string>());
  const moveRafId = useRef<number | null>(null);
  const lastMoveSent = useRef(0);

  useEffect(() => {
    if (!humanPlayerId) return;

    const dirMap: Record<string, { dx: number; dy: number }> = {
      ArrowUp: { dx: 0, dy: -1 },
      ArrowDown: { dx: 0, dy: 1 },
      ArrowLeft: { dx: -1, dy: 0 },
      ArrowRight: { dx: 1, dy: 0 },
      w: { dx: 0, dy: -1 },
      s: { dx: 0, dy: 1 },
      a: { dx: -1, dy: 0 },
      d: { dx: 1, dy: 0 },
    };

    const LOOK_AHEAD = 2; // tiles ahead to target for smooth paths
    const MOVE_THROTTLE = 200; // ms between moveTo sends

    const tick = () => {
      moveRafId.current = null;
      if (keysDown.current.size === 0) return;

      const now = Date.now();
      if (now - lastMoveSent.current < MOVE_THROTTLE) {
        moveRafId.current = requestAnimationFrame(tick);
        return;
      }

      const player = props.game.world.players.get(humanPlayerId);
      if (!player) {
        moveRafId.current = requestAnimationFrame(tick);
        return;
      }

      // Use the latest pressed key for direction (like Gather)
      let latestDir: { dx: number; dy: number } | null = null;
      for (const key of keysDown.current) {
        if (dirMap[key]) latestDir = dirMap[key];
      }
      if (!latestDir) {
        moveRafId.current = requestAnimationFrame(tick);
        return;
      }

      const dest = {
        x: Math.max(0, Math.min(width - 1, Math.floor(player.position.x) + latestDir.dx * LOOK_AHEAD)),
        y: Math.max(0, Math.min(height - 1, Math.floor(player.position.y) + latestDir.dy * LOOK_AHEAD)),
      };

      lastMoveSent.current = now;
      void toastOnError(moveTo({ playerId: humanPlayerId, destination: dest }));

      moveRafId.current = requestAnimationFrame(tick);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!dirMap[e.key]) return;
      e.preventDefault();
      keysDown.current.add(e.key);
      if (!moveRafId.current) {
        lastMoveSent.current = 0; // allow immediate first move
        moveRafId.current = requestAnimationFrame(tick);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key);
      if (keysDown.current.size === 0 && moveRafId.current) {
        cancelAnimationFrame(moveRafId.current);
        moveRafId.current = null;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (moveRafId.current) {
        cancelAnimationFrame(moveRafId.current);
        moveRafId.current = null;
      }
    };
  }, [humanPlayerId, props.game, moveTo, width, height, tileDim]);

  return (
    <PixiViewport
      app={pixiApp}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={width * tileDim}
      worldHeight={height * tileDim}
      viewportRef={viewportRef}
    >
      <PixiStaticMap
        map={props.game.worldMap}
        onpointerup={onMapPointerUp}
        onpointerdown={onMapPointerDown}
      />
      {players.map(
        (p) =>
          // Only show the path for the human player in non-debug mode.
          (SHOW_DEBUG_UI || p.id === humanPlayerId) && (
            <DebugPath key={`path-${p.id}`} player={p} tileDim={tileDim} />
          ),
      )}
      {lastDestination && <PositionIndicator destination={lastDestination} tileDim={tileDim} />}
      {players.map((p) => (
        <Player
          key={`player-${p.id}`}
          game={props.game}
          player={p}
          isViewer={p.id === humanPlayerId}
          onClick={props.setSelectedElement}
          historicalTime={props.historicalTime}
        />
      ))}
    </PixiViewport>
  );
};
export default PixiGame;
