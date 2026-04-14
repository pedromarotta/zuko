import { BaseTexture, ISpritesheetData, Spritesheet } from 'pixi.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatedSprite, Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';

export const Character = ({
  textureUrl,
  spritesheetData,
  x,
  y,
  orientation,
  isMoving = false,
  isThinking = false,
  isSpeaking = false,
  emoji = '',
  isViewer = false,
  isAgent = false,
  name = '',
  speed = 0.1,
  onClick,
}: {
  textureUrl: string;
  spritesheetData: ISpritesheetData;
  x: number;
  y: number;
  orientation: number;
  isMoving?: boolean;
  isThinking?: boolean;
  isSpeaking?: boolean;
  emoji?: string;
  isViewer?: boolean;
  isAgent?: boolean;
  name?: string;
  speed?: number;
  onClick: () => void;
}) => {
  const [spriteSheet, setSpriteSheet] = useState<Spritesheet>();
  useEffect(() => {
    const parseSheet = async () => {
      const sheet = new Spritesheet(
        BaseTexture.from(textureUrl, {
          scaleMode: PIXI.SCALE_MODES.NEAREST,
        }),
        spritesheetData,
      );
      await sheet.parse();
      setSpriteSheet(sheet);
    };
    void parseSheet();
  }, []);

  const roundedOrientation = Math.floor(orientation / 90);
  const direction = ['right', 'down', 'left', 'up'][roundedOrientation];

  const ref = useRef<PIXI.AnimatedSprite | null>(null);
  useEffect(() => {
    if (isMoving) {
      ref.current?.play();
    }
  }, [direction, isMoving]);

  if (!spriteSheet) return null;

  return (
    <Container x={x} y={y} interactive={true} pointerdown={onClick} cursor="pointer">
      {/* Name label above avatar */}
      {name && (
        <>
          <NameBackground name={name} isAgent={isAgent} />
          <Text
            x={0}
            y={-22}
            text={name}
            anchor={{ x: 0.5, y: 0.5 }}
            style={
              new PIXI.TextStyle({
                fontFamily: 'Arial, sans-serif',
                fontSize: 11,
                fontWeight: 'bold',
                fill: '#ffffff',
                dropShadow: true,
                dropShadowColor: '#000000',
                dropShadowBlur: 2,
                dropShadowDistance: 0,
              })
            }
          />
          {/* Status dot */}
          <StatusDot x={-(name.length * 3 + 8)} y={-22} isAgent={isAgent} />
        </>
      )}
      {isThinking && (
        <Text x={-20} y={-10} scale={{ x: -0.8, y: 0.8 }} text={'💭'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isSpeaking && (
        <Text x={18} y={-10} scale={0.8} text={'💬'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isViewer && <ViewerIndicator />}
      <AnimatedSprite
        ref={ref}
        isPlaying={isMoving}
        textures={spriteSheet.animations[direction]}
        animationSpeed={speed}
        anchor={{ x: 0.5, y: 0.5 }}
      />
      {emoji && (
        <Text x={0} y={-24} scale={{ x: -0.8, y: 0.8 }} text={emoji} anchor={{ x: 0.5, y: 0.5 }} />
      )}
    </Container>
  );
};

function NameBackground({ name, isAgent }: { name: string; isAgent: boolean }) {
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      const width = name.length * 6.5 + 20;
      g.beginFill(isAgent ? 0x1a1d2e : 0x000000, 0.6);
      g.drawRoundedRect(-width / 2, -30, width, 16, 4);
      g.endFill();
    },
    [name, isAgent],
  );
  return <Graphics draw={draw} />;
}

function StatusDot({ x, y, isAgent }: { x: number; y: number; isAgent: boolean }) {
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      g.beginFill(isAgent ? 0x818cf8 : 0x4ade80);
      g.drawCircle(x, y, 3);
      g.endFill();
    },
    [x, y, isAgent],
  );
  return <Graphics draw={draw} />;
}

function ViewerIndicator() {
  const draw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.beginFill(0xffff0b, 0.5);
    g.drawRoundedRect(-10, 10, 20, 10, 100);
    g.endFill();
  }, []);

  return <Graphics draw={draw} />;
}
