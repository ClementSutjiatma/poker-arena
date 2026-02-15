'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * Deterministic seeded PRNG (mulberry32) so the same name always produces the same horse.
 */
function seedFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(31, h) + name.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Generate a unique horse color palette from a name. */
function generatePalette(rng: () => number) {
  const bodyHue = pick(rng, [20, 25, 30, 35, 15, 10, 0, 45, 50, 340, 350]);
  const bodySat = 30 + Math.floor(rng() * 50);
  const bodyLit = 30 + Math.floor(rng() * 30);

  const body = hslToHex(bodyHue, bodySat, bodyLit);
  const bodyDark = hslToHex(bodyHue, bodySat, Math.max(bodyLit - 12, 12));
  const bodyLight = hslToHex(bodyHue, Math.max(bodySat - 10, 10), Math.min(bodyLit + 18, 78));

  const maneHue = rng() > 0.5 ? bodyHue : pick(rng, [0, 30, 45, 55, 200, 270, 330]);
  const maneSat = 25 + Math.floor(rng() * 55);
  const maneLit = 15 + Math.floor(rng() * 35);
  const mane = hslToHex(maneHue, maneSat, maneLit);

  const eye = '#1a1a2e';
  const eyeShine = '#ffffff';
  const blush = '#e8808080'; // pink blush

  const nose = hslToHex(bodyHue, Math.max(bodySat - 15, 8), Math.min(bodyLit + 25, 82));

  const accessory = pick(rng, ['#d4263e', '#ff4d4d', '#ffcc00', '#ff6600', '#e83030', '#c41e3a']);

  return { body, bodyDark, bodyLight, mane, eye, eyeShine, blush, nose, accessory };
}

type Pixel = string | null;

// Eye pixel coordinates for blink tracking
interface EyeCoords {
  pupils: [number, number][];
  shines: [number, number][];
}

/**
 * Chibi-style 16x16 pixel art horse — front-facing, big head, cute proportions.
 * Big round face taking up most of the canvas, tiny body, large sparkly eyes.
 */
function generateHorsePixels(name: string): { pixels: Pixel[]; palette: ReturnType<typeof generatePalette>; eyeCoords: EyeCoords } {
  const seed = seedFromName(name);
  const rng = mulberry32(seed);
  const palette = generatePalette(rng);
  const { body, bodyDark, bodyLight, mane, eye, eyeShine, nose, accessory } = palette;

  const B = body;
  const D = bodyDark;
  const L = bodyLight;
  const M = mane;
  const E = eye;
  const S = eyeShine;
  const N = nose;
  const A = accessory;

  const hasBlaze = rng() > 0.5;
  const hasAccessory = rng() > 0.35;
  const earVariant = Math.floor(rng() * 2); // 0 = pointy, 1 = round
  const hasCheekBlush = rng() > 0.4;

  const grid: Pixel[][] = Array.from({ length: 16 }, () => Array(16).fill(null));
  const set = (r: number, c: number, color: string) => {
    if (r >= 0 && r < 16 && c >= 0 && c < 16) grid[r][c] = color;
  };

  // ==========================================
  // CHIBI HORSE — front-facing, centered
  // Big head rows 1-11, tiny body rows 12-13, stubby legs 14-15
  // ==========================================

  // --- EARS (rows 0-1) ---
  if (earVariant === 0) {
    // Pointy cute ears
    set(0, 3, B);               set(0, 12, B);
    set(1, 3, B); set(1, 4, B); set(1, 11, B); set(1, 12, B);
  } else {
    // Round ears
    set(0, 3, B); set(0, 4, B); set(0, 11, B); set(0, 12, B);
    set(1, 3, B); set(1, 4, L); set(1, 11, L); set(1, 12, B);
  }

  // Mane tuft between ears
  set(0, 6, M); set(0, 7, M); set(0, 8, M); set(0, 9, M);
  set(1, 5, M); set(1, 6, M); set(1, 7, M); set(1, 8, M); set(1, 9, M); set(1, 10, M);

  // CNY accessory on mane (little flower/ribbon)
  if (hasAccessory) {
    set(0, 7, A); set(0, 8, A);
    set(1, 7, A);
  }

  // --- HEAD (rows 2-9) — big round face ---
  // Row 2: top of head
  set(2, 4, B); set(2, 5, B); set(2, 6, B); set(2, 7, B);
  set(2, 8, B); set(2, 9, B); set(2, 10, B); set(2, 11, B);

  // Row 3
  set(3, 3, B); set(3, 4, B); set(3, 5, B); set(3, 6, B); set(3, 7, B);
  set(3, 8, B); set(3, 9, B); set(3, 10, B); set(3, 11, B); set(3, 12, B);

  // Forehead blaze
  if (hasBlaze) {
    set(3, 7, L); set(3, 8, L);
  }

  // Row 4: forehead
  set(4, 3, B); set(4, 4, B); set(4, 5, B); set(4, 6, B); set(4, 7, B);
  set(4, 8, B); set(4, 9, B); set(4, 10, B); set(4, 11, B); set(4, 12, B);
  if (hasBlaze) {
    set(4, 7, L); set(4, 8, L);
  }

  // Row 5: EYE ROW — big cute eyes with shine
  set(5, 3, B); set(5, 4, B);
  // Left eye: 2x2 dark pupil with shine
  set(5, 5, E); set(5, 6, E);
  set(5, 7, B); set(5, 8, B);
  // Right eye: 2x2 dark pupil with shine
  set(5, 9, E); set(5, 10, E);
  set(5, 11, B); set(5, 12, B);

  // Row 6: bottom of eyes + shine dots
  set(6, 3, B); set(6, 4, B);
  set(6, 5, E); set(6, 6, S); // left eye bottom + shine
  set(6, 7, B); set(6, 8, B);
  set(6, 9, E); set(6, 10, S); // right eye bottom + shine
  set(6, 11, B); set(6, 12, B);

  // Row 7: cheeks + blush
  set(7, 3, B); set(7, 4, B); set(7, 5, B); set(7, 6, B); set(7, 7, B);
  set(7, 8, B); set(7, 9, B); set(7, 10, B); set(7, 11, B); set(7, 12, B);
  if (hasCheekBlush) {
    set(7, 4, '#e8a0a0'); set(7, 5, '#e8a0a0'); // left blush
    set(7, 10, '#e8a0a0'); set(7, 11, '#e8a0a0'); // right blush
  }

  // Row 8: snout area
  set(8, 4, B); set(8, 5, B); set(8, 6, N); set(8, 7, N);
  set(8, 8, N); set(8, 9, N); set(8, 10, B); set(8, 11, B);

  // Row 9: muzzle — nostrils + cute little smile
  set(9, 5, B); set(9, 6, N); set(9, 7, D); set(9, 8, D); set(9, 9, N); set(9, 10, B);

  // Row 10: chin
  set(10, 6, B); set(10, 7, B); set(10, 8, B); set(10, 9, B);

  // --- BODY (rows 11-12) — small compact body ---
  set(11, 5, B); set(11, 6, B); set(11, 7, B); set(11, 8, B); set(11, 9, B); set(11, 10, B);
  set(12, 5, B); set(12, 6, D); set(12, 7, B); set(12, 8, B); set(12, 9, D); set(12, 10, B);

  // Mane flowing down sides
  set(2, 3, M); set(2, 12, M);
  set(3, 2, M); set(3, 13, M);
  set(4, 2, M); set(4, 13, M);
  set(5, 2, M);
  set(6, 2, M);

  // --- LEGS (rows 13-15) — short stubby legs ---
  // Front legs
  set(13, 5, D); set(13, 6, D);       set(13, 9, D); set(13, 10, D);
  set(14, 5, D); set(14, 6, D);       set(14, 9, D); set(14, 10, D);
  // Hooves
  set(15, 5, bodyDark); set(15, 6, bodyDark); set(15, 9, bodyDark); set(15, 10, bodyDark);

  // Tail (tiny cute tail poking out right)
  set(11, 11, M); set(11, 12, M);
  set(12, 12, M); set(12, 13, M);

  const eyeCoords: EyeCoords = {
    pupils: [[5, 5], [5, 6], [5, 9], [5, 10], [6, 5], [6, 9]],
    shines: [[6, 6], [6, 10]],
  };

  return { pixels: grid.flat(), palette, eyeCoords };
}

interface HorseAvatarProps {
  name: string;
  size?: number;
  /** When true, the horse closes its eyes briefly (blink animation). */
  shouldBlink?: boolean;
  /** When true, renders a fire aura around the horse (winning streak). */
  isOnStreak?: boolean;
}

export default function HorseAvatar({ name, size = 48, shouldBlink = false, isOnStreak = false }: HorseAvatarProps) {
  const { pixels, palette, eyeCoords } = generateHorsePixels(name);
  const [eyesClosed, setEyesClosed] = useState(false);
  const blinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevBlinkRef = useRef(shouldBlink);

  // Trigger blink when shouldBlink transitions to true
  useEffect(() => {
    if (shouldBlink && !prevBlinkRef.current) {
      setEyesClosed(true);
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      blinkTimeoutRef.current = setTimeout(() => {
        setEyesClosed(false);
        blinkTimeoutRef.current = setTimeout(() => {
          setEyesClosed(true);
          blinkTimeoutRef.current = setTimeout(() => {
            setEyesClosed(false);
          }, 150);
        }, 200);
      }, 200);
    }
    prevBlinkRef.current = shouldBlink;
    return () => {
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
    };
  }, [shouldBlink]);

  // Occasional idle blink every ~4-7 seconds
  useEffect(() => {
    const idleBlink = () => {
      if (!eyesClosed) {
        setEyesClosed(true);
        setTimeout(() => setEyesClosed(false), 180);
      }
    };
    const interval = setInterval(idleBlink, 4000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, []);

  // Build lookup sets for eye coordinates
  const pupilSet = new Set(eyeCoords.pupils.map(([r, c]) => `${r},${c}`));
  const shineSet = new Set(eyeCoords.shines.map(([r, c]) => `${r},${c}`));

  return (
    <div
      className={`relative flex-shrink-0 ${isOnStreak ? 'horse-on-fire' : ''}`}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      title={name}
    >
      {/* Fire animation CSS */}
      {isOnStreak && (
        <style>{`
          @keyframes fireFlicker {
            0%, 100% { opacity: 0.9; transform: scaleY(1) translateY(0); }
            25% { opacity: 1; transform: scaleY(1.1) translateY(-1px); }
            50% { opacity: 0.85; transform: scaleY(0.95) translateY(1px); }
            75% { opacity: 1; transform: scaleY(1.05) translateY(-2px); }
          }
          @keyframes fireGlow {
            0%, 100% { box-shadow: 0 0 8px 3px rgba(255, 100, 0, 0.5), 0 0 16px 6px rgba(255, 60, 0, 0.25); }
            50% { box-shadow: 0 0 12px 5px rgba(255, 120, 0, 0.6), 0 0 24px 8px rgba(255, 60, 0, 0.35); }
          }
          @keyframes emberRise {
            0% { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(-14px) scale(0.3); }
          }
          .horse-on-fire {
            animation: fireGlow 0.8s ease-in-out infinite;
            border-radius: 8px;
          }
          .fire-particle {
            position: absolute;
            width: 3px;
            height: 3px;
            border-radius: 50%;
            animation: emberRise 1s ease-out infinite;
            pointer-events: none;
          }
          .flame-layer {
            position: absolute;
            inset: -3px;
            border-radius: 10px;
            animation: fireFlicker 0.6s ease-in-out infinite;
            pointer-events: none;
          }
        `}</style>
      )}

      {/* Fire layers behind the horse */}
      {isOnStreak && (
        <>
          {/* Outer flame glow */}
          <div
            className="flame-layer"
            style={{
              background: 'radial-gradient(ellipse at center bottom, rgba(255,80,0,0.4) 0%, rgba(255,160,0,0.15) 40%, transparent 70%)',
              animationDelay: '0s',
            }}
          />
          {/* Inner flame glow */}
          <div
            className="flame-layer"
            style={{
              inset: '-1px',
              background: 'radial-gradient(ellipse at center bottom, rgba(255,200,0,0.3) 0%, rgba(255,100,0,0.1) 35%, transparent 65%)',
              animationDelay: '0.3s',
            }}
          />
          {/* Ember particles */}
          <div className="fire-particle" style={{ left: '15%', bottom: '60%', background: '#ff6600', animationDelay: '0s', animationDuration: '1.2s' }} />
          <div className="fire-particle" style={{ left: '75%', bottom: '55%', background: '#ffaa00', animationDelay: '0.4s', animationDuration: '0.9s' }} />
          <div className="fire-particle" style={{ left: '45%', bottom: '70%', background: '#ff4400', animationDelay: '0.7s', animationDuration: '1.1s' }} />
          <div className="fire-particle" style={{ left: '30%', bottom: '45%', background: '#ffcc00', animationDelay: '0.2s', animationDuration: '1.3s' }} />
          <div className="fire-particle" style={{ left: '60%', bottom: '50%', background: '#ff5500', animationDelay: '0.9s', animationDuration: '1.0s' }} />
        </>
      )}

      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'relative', zIndex: 1 }}
      >
        {pixels.map((color, i) => {
          if (!color) return null;
          const row = Math.floor(i / 16);
          const col = i % 16;
          const key = `${row},${col}`;

          // When eyes closed: pupils become a horizontal line (body color),
          // shines disappear (body color)
          if (pupilSet.has(key)) {
            if (eyesClosed) {
              // Show a closed-eye line only on the bottom row of the eye (row 6)
              if (row === 6) {
                return <rect key={i} x={col} y={row} width={1} height={1} fill={palette.eye} />;
              }
              return <rect key={i} x={col} y={row} width={1} height={1} fill={palette.body} />;
            }
            return <rect key={i} x={col} y={row} width={1} height={1} fill={palette.eye} />;
          }

          if (shineSet.has(key)) {
            if (eyesClosed) {
              return <rect key={i} x={col} y={row} width={1} height={1} fill={palette.body} />;
            }
            return <rect key={i} x={col} y={row} width={1} height={1} fill={palette.eyeShine} />;
          }

          return <rect key={i} x={col} y={row} width={1} height={1} fill={color} />;
        })}
      </svg>
    </div>
  );
}
