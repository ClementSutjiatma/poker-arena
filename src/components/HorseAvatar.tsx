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
  // Body hue — warm earthy tones (browns, chestnuts, bays, grays, blacks, reds)
  const bodyHue = pick(rng, [20, 25, 30, 35, 15, 10, 0, 45, 50, 340, 350]);
  const bodySat = 30 + Math.floor(rng() * 50); // 30-80
  const bodyLit = 25 + Math.floor(rng() * 35); // 25-60

  const body = hslToHex(bodyHue, bodySat, bodyLit);
  const bodyDark = hslToHex(bodyHue, bodySat, Math.max(bodyLit - 15, 10));
  const bodyLight = hslToHex(bodyHue, Math.max(bodySat - 10, 10), Math.min(bodyLit + 20, 80));

  // Mane — can be same family or contrasting
  const maneHue = rng() > 0.5 ? bodyHue : pick(rng, [0, 30, 45, 55, 200, 210, 270, 330]);
  const maneSat = 20 + Math.floor(rng() * 60);
  const maneLit = 15 + Math.floor(rng() * 40);
  const mane = hslToHex(maneHue, maneSat, maneLit);

  // Eye
  const eye = '#1a1a2e';
  const eyeWhite = '#f0f0f0';

  // Nose/muzzle marking — lighter snout
  const nose = hslToHex(bodyHue, Math.max(bodySat - 20, 5), Math.min(bodyLit + 30, 85));

  // Accessory color — a festive CNY color
  const accessory = pick(rng, ['#d4263e', '#ff4d4d', '#ffcc00', '#ff6600', '#e83030', '#c41e3a']);

  return { body, bodyDark, bodyLight, mane, eye, eyeWhite, nose, accessory };
}

type Pixel = string | null;

/**
 * Generate a 16x16 pixel art horse facing right.
 * Returns a flat array of 256 entries (row-major), each a hex color or null (transparent).
 */
function generateHorsePixels(name: string): { pixels: Pixel[]; palette: ReturnType<typeof generatePalette> } {
  const seed = seedFromName(name);
  const rng = mulberry32(seed);
  const palette = generatePalette(rng);
  const { body, bodyDark, bodyLight, mane, eye, eyeWhite, nose, accessory } = palette;

  const _ = null; // transparent
  const B = body;
  const D = bodyDark;
  const L = bodyLight;
  const M = mane;
  const E = eye;
  const W = eyeWhite;
  const N = nose;
  const A = accessory;

  // Has blaze (white forehead marking)?
  const hasBlaze = rng() > 0.5;
  // Has accessory (CNY ribbon/ornament on mane)?
  const hasAccessory = rng() > 0.3;
  // Ear style variant
  const earStyle = Math.floor(rng() * 3);

  // Build the 16x16 grid row by row
  // Horse facing right, side profile, head top-right, legs bottom
  const grid: Pixel[][] = Array.from({ length: 16 }, () => Array(16).fill(null));

  // Helper to set pixel if in bounds
  const set = (r: number, c: number, color: string) => {
    if (r >= 0 && r < 16 && c >= 0 && c < 16) grid[r][c] = color;
  };

  // --- EARS (rows 0-2) ---
  if (earStyle === 0) {
    // Pointed ears
    set(0, 10, M); set(0, 11, B);
    set(1, 10, B); set(1, 11, B); set(1, 12, B);
  } else if (earStyle === 1) {
    // Rounded ears
    set(0, 10, B); set(0, 11, B);
    set(1, 9, B); set(1, 10, B); set(1, 11, B); set(1, 12, B);
  } else {
    // Tall ears
    set(0, 11, M);
    set(1, 10, B); set(1, 11, B);
    set(2, 10, B); set(2, 11, B);
  }

  // --- MANE (top of head / neck, rows 1-7) ---
  if (hasAccessory) {
    set(1, 8, A); set(1, 9, A);
    set(2, 7, A);
  }
  set(2, 8, M); set(2, 9, M);
  set(3, 7, M); set(3, 8, M);
  set(4, 6, M); set(4, 7, M);
  set(5, 5, M); set(5, 6, M);
  set(6, 4, M); set(6, 5, M);
  set(7, 4, M);

  // --- HEAD (rows 2-6) ---
  // Forehead
  set(2, 10, B); set(2, 11, B); set(2, 12, B);
  if (hasBlaze) set(2, 11, L);

  // Head main
  set(3, 9, B); set(3, 10, B); set(3, 11, B); set(3, 12, B); set(3, 13, B);
  if (hasBlaze) set(3, 11, L);

  // Eye row
  set(4, 8, B); set(4, 9, B); set(4, 10, W); set(4, 11, E); set(4, 12, B); set(4, 13, B);

  // Cheek
  set(5, 7, B); set(5, 8, B); set(5, 9, B); set(5, 10, B); set(5, 11, B); set(5, 12, B); set(5, 13, N);

  // Muzzle
  set(6, 8, B); set(6, 9, B); set(6, 10, B); set(6, 11, N); set(6, 12, N); set(6, 13, N);
  // Nostril
  set(6, 12, D);

  // Chin / jaw
  set(7, 7, B); set(7, 8, B); set(7, 9, B); set(7, 10, B); set(7, 11, N);

  // --- NECK (rows 7-9) ---
  set(7, 5, B); set(7, 6, B);
  set(8, 4, B); set(8, 5, B); set(8, 6, B); set(8, 7, B); set(8, 8, B); set(8, 9, B);
  set(9, 3, B); set(9, 4, B); set(9, 5, B); set(9, 6, B); set(9, 7, B); set(9, 8, B); set(9, 9, B);

  // --- BODY (rows 10-12) ---
  set(10, 2, B); set(10, 3, B); set(10, 4, B); set(10, 5, B); set(10, 6, B); set(10, 7, B);
  set(10, 8, B); set(10, 9, B); set(10, 10, B); set(10, 11, B);
  set(11, 2, B); set(11, 3, B); set(11, 4, B); set(11, 5, D); set(11, 6, B); set(11, 7, B);
  set(11, 8, B); set(11, 9, D); set(11, 10, B); set(11, 11, B); set(11, 12, B);
  set(12, 2, B); set(12, 3, D); set(12, 4, B); set(12, 5, B); set(12, 6, B); set(12, 7, B);
  set(12, 8, B); set(12, 9, B); set(12, 10, D); set(12, 11, B); set(12, 12, B);

  // Tail (left side, rows 9-12)
  set(9, 1, M); set(9, 2, M);
  set(10, 0, M); set(10, 1, M);
  set(11, 0, M); set(11, 1, M);
  set(12, 1, M);

  // --- LEGS (rows 13-15) ---
  // Front legs
  set(13, 8, D); set(13, 9, D); set(13, 11, D); set(13, 12, D);
  set(14, 8, D); set(14, 9, D); set(14, 11, D); set(14, 12, D);
  // Hooves
  set(15, 8, bodyDark); set(15, 9, bodyDark); set(15, 11, bodyDark); set(15, 12, bodyDark);

  // Back legs
  set(13, 2, D); set(13, 3, D); set(13, 5, D); set(13, 6, D);
  set(14, 2, D); set(14, 3, D); set(14, 5, D); set(14, 6, D);
  set(15, 2, bodyDark); set(15, 3, bodyDark); set(15, 5, bodyDark); set(15, 6, bodyDark);

  // Belly shading
  set(13, 4, D); set(13, 7, D); set(13, 10, D);

  return { pixels: grid.flat(), palette };
}

interface HorseAvatarProps {
  name: string;
  size?: number;
  /** When true, the horse closes its eyes briefly (blink animation). */
  shouldBlink?: boolean;
}

export default function HorseAvatar({ name, size = 48, shouldBlink = false }: HorseAvatarProps) {
  const { pixels, palette } = generateHorsePixels(name);
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

  const pixelSize = size / 16;

  // Eye pixel location (row 4, col 11 is the pupil)
  const eyeRow = 4;
  const eyeCol = 11;
  const eyeWhiteCol = 10;

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      title={name}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        style={{ imageRendering: 'pixelated' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {pixels.map((color, i) => {
          if (!color) return null;
          const row = Math.floor(i / 16);
          const col = i % 16;

          // Handle eye pixels — override when blinking
          if (row === eyeRow && col === eyeCol) {
            return (
              <rect
                key={i}
                x={col}
                y={row}
                width={1}
                height={1}
                fill={eyesClosed ? palette.body : palette.eye}
              />
            );
          }
          if (row === eyeRow && col === eyeWhiteCol) {
            return (
              <rect
                key={i}
                x={col}
                y={row}
                width={1}
                height={1}
                fill={eyesClosed ? palette.body : palette.eyeWhite}
              />
            );
          }

          return (
            <rect
              key={i}
              x={col}
              y={row}
              width={1}
              height={1}
              fill={color}
            />
          );
        })}
      </svg>
    </div>
  );
}
