import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Public contact ID like AX7K-9M2P (no O/0/I/1 to avoid confusion) */
export function generatePublicId() {
  const part = (n) =>
    Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return `${part(4)}-${part(4)}`;
}

// Compact word list for recovery phrases (easy to write down)
const WORDS = [
  'apple', 'bridge', 'cloud', 'delta', 'ember', 'forest', 'galaxy', 'harbor',
  'island', 'jungle', 'kite', 'lemon', 'meadow', 'night', 'ocean', 'pixel',
  'quartz', 'river', 'storm', 'tiger', 'umbra', 'valley', 'willow', 'xenon',
  'yellow', 'zebra', 'anchor', 'beacon', 'canyon', 'dragon', 'echo', 'falcon',
  'glacier', 'hammer', 'ivory', 'jasper', 'kernel', 'lantern', 'marble', 'nebula',
  'orchid', 'prism', 'quasar', 'rocket', 'silver', 'thunder', 'ultra', 'vortex',
  'whisper', 'yonder', 'zenith', 'aurora', 'blaze', 'comet', 'dusk', 'ember',
  'frost', 'grove', 'helix', 'iris', 'jade', 'keystone', 'lotus', 'mirage',
  'nova', 'orbit', 'phoenix', 'quest', 'ridge', 'shadow', 'tide', 'unity',
  'violet', 'wave', 'axiom', 'bloom', 'coral', 'drift', 'flame', 'glyph',
];

/** 8-word recovery phrase, space-separated */
export function generateRecoveryPhrase() {
  const picks = [];
  for (let i = 0; i < 8; i++) {
    picks.push(WORDS[crypto.randomInt(WORDS.length)]);
  }
  return picks.join(' ');
}

export function normalizePhrase(phrase) {
  return String(phrase || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
