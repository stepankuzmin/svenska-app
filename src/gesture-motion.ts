const springFrequency = (2 * Math.PI) / 0.35;

export function rubberband(offset: number, size: number): number {
  return (offset * size * 0.55) / (size + 0.55 * Math.abs(offset));
}

export function releaseVelocity(samples: readonly { position: number; t: number }[], releasedAt: number): number {
  const recent = samples.findIndex((sample) => releasedAt - sample.t <= 100);
  const first = samples[recent === -1 ? samples.length - 1 : Math.max(0, recent - 1)];
  const last = samples.at(-1);
  return first === undefined || last === undefined || releasedAt === first.t ? 0 : ((last.position - first.position) / (releasedAt - Math.max(first.t, releasedAt - 100))) * 1000;
}

export function springStep(offset: number, velocity: number, elapsed: number): { offset: number; velocity: number } {
  const slope = velocity + springFrequency * offset;
  const decay = Math.exp(-springFrequency * elapsed);
  const next = offset + slope * elapsed;
  return { offset: next * decay, velocity: (slope - springFrequency * next) * decay };
}
