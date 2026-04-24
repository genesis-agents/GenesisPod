/**
 * Filter a plan's dimensions by the active identity dimensionScope.
 *
 * - scope undefined OR empty  -> return all dimensions unchanged
 * - scope has ids             -> keep only dimensions whose id is in the scope
 *
 * Matches by `id` (DB id) — the canonical identifier after PlanStage.persist.
 * If the id hasn't been populated yet (pre-persist), falls back to `name`.
 */

export interface ScopableDimension {
  readonly id?: string;
  readonly name?: string;
}

export function filterScopedDimensions<D extends ScopableDimension>(
  dimensions: readonly D[],
  scope: readonly string[] | undefined,
): readonly D[] {
  if (!scope || scope.length === 0) return dimensions;
  const wanted = new Set(scope);
  return dimensions.filter((d) => {
    if (d.id && wanted.has(d.id)) return true;
    if (d.name && wanted.has(d.name)) return true;
    return false;
  });
}
