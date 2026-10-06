import { DECORATIVE_PAIRINGS, hashString, LOGO_PAIRINGS, pairingFor } from '@splinance/shared';
import { MOTIFS } from './motifs';

const ALL_PAIRINGS = [...LOGO_PAIRINGS, ...DECORATIVE_PAIRINGS];

/** Seed-derived look; separate hash salts keep motif and pairing independent. */
export function patternStyleFor(seed: string, decorative = false) {
  const motif = MOTIFS[hashString(`motif:${seed}`) % MOTIFS.length] ?? 'dots';
  const pairing = pairingFor(seed, decorative ? ALL_PAIRINGS : LOGO_PAIRINGS);
  return { motif, pairing };
}
