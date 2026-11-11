/**
 * A bank export dropped somewhere else in the app (the household map), on its way to the
 * import page. A `File` cannot travel in the URL and must not be stored, so it waits here,
 * in memory, for the page to take it: once, and only if the page opens right away.
 */
let pending: { file: File; householdId: string } | undefined;

export function stashImportFile(householdId: string, file: File): void {
  pending = { file, householdId };
}

/** The stashed file for this household, if any. Taking it empties the stash either way. */
export function takeImportFile(householdId: string): File | undefined {
  const taken = pending;
  pending = undefined;
  return taken?.householdId === householdId ? taken.file : undefined;
}
