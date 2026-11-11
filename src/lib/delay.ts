/** Current subtitle delay in seconds (positive = subtitles later). Read by the sources on every tick, set from settings. */
export const subDelay = { value: 0 };

export function fmtDelay(s: number): string {
  const v = Math.round(s * 10) / 10;
  return v === 0 ? '0.0s' : `${v > 0 ? '+' : ''}${v.toFixed(1)}s`;
}
