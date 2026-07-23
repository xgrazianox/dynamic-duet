import { describe, it, expect } from 'vitest';
import { createAttemptTracker } from '@/services/attemptKey';

describe('attempt key (F6-r2.1)', () => {
  const A = { tolerance_pp: 1, default_fx: { USD: 0.9 }, engine_config: { signalA: { smaMonths: 10 } } };
  it('stesso tentativo, stesso payload → stessa chiave (retry dopo risposta persa)', () => {
    const t = createAttemptTracker();
    expect(t.keyFor(A)).toBe(t.keyFor({ ...A, default_fx: { USD: 0.9 }, engine_config: { signalA: { smaMonths: 10 } } }));
  });
  it('modifica annidata SOLO a default_fx → chiave nuova', () => {
    const t = createAttemptTracker();
    const k1 = t.keyFor(A);
    expect(t.keyFor({ ...A, default_fx: { USD: 0.91 } })).not.toBe(k1);
  });
  it('modifica annidata SOLO a engine_config → chiave nuova', () => {
    const t = createAttemptTracker();
    const k1 = t.keyFor(A);
    expect(t.keyFor({ ...A, engine_config: { signalA: { smaMonths: 12 } } })).not.toBe(k1);
  });
  it('A → B → A dopo due successi → la seconda A ha chiave NUOVA', () => {
    const t = createAttemptTracker();
    const kA1 = t.keyFor(A); t.complete();
    const kB = t.keyFor({ tolerance_pp: 2 }); t.complete();
    const kA2 = t.keyFor(A);
    expect(kA2).not.toBe(kA1); expect(kA2).not.toBe(kB);
  });
  it('doppio submit contemporaneo: keyFor idempotente entro il tentativo', () => {
    const t = createAttemptTracker();
    expect(t.keyFor(A)).toBe(t.keyFor(A));
  });
});
