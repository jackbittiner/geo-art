export const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'sine', 'exp'] as const
export type Easing = (typeof EASINGS)[number]

export function ease(kind: Easing, t: number): number {
  const x = Math.min(1, Math.max(0, t))
  switch (kind) {
    case 'linear':
      return x
    case 'easeIn':
      return x * x
    case 'easeOut':
      return 1 - (1 - x) * (1 - x)
    case 'easeInOut':
      return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
    case 'sine':
      return 0.5 - 0.5 * Math.cos(Math.PI * x)
    case 'exp':
      return x === 0 ? 0 : x === 1 ? 1 : 2 ** (10 * x - 10)
  }
}
