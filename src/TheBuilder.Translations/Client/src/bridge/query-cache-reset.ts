/**
 * Lets the entry point drop the editors' query cache without importing it. The cache lives with
 * React in the hosts' chunk, and importing that from the entry point loaded all of React on every
 * backoffice start, before the entry point could finish starting. If the hosts have not loaded,
 * there is nothing cached to drop.
 */
const listeners = new Set<() => void>();

export const onQueryCacheReset = (listener: () => void): void => {
  listeners.add(listener);
};

export const resetQueryCache = (): void => {
  for (const listener of listeners) {
    listener();
  }
};
