// Pure axis helpers, no Foundry access.

export interface Point {
  x: number;
  y: number;
}

export interface AxisBinding {
  index: number;
  reversed: boolean;
}

/** Value of the axis a binding points at, 0 when the gamepad does not have that axis. */
export function readAxis(binding: AxisBinding | undefined, values: readonly number[]): number {
  if (!binding) return 0;
  const value = values[binding.index] ?? 0;
  return (binding.reversed ? -value : value) + 0;
}
