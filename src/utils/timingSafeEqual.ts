import { timingSafeEqual } from 'crypto';

// Comparaison à temps constant pour les secrets/clés API — une comparaison
// `===`/`!==` classique s'arrête au premier octet différent, ce qui fuit une
// information exploitable par timing attack sur un secret partagé.
export const secureEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};
