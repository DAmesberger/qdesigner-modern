/** Detach reactive participant values before asynchronous IndexedDB writes. */
export function storageSnapshot<T>(value: T) {
  return $state.snapshot(value);
}
