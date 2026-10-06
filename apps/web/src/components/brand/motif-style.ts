import { hashString, pairingFor } from '@splinance/shared';
import { MOTIFS } from './motifs';

/** Motif and pairing derived from a seed (e.g. a household id); salts keep them independent. */
export function motifStyleFor(seed: string) {
  const motif = MOTIFS[hashString(`motif:${seed}`) % MOTIFS.length] ?? 'dots';
  return { motif, pairing: pairingFor(seed) };
}
