/** In-memory Web Storage, for code that keeps tokens or preferences in localStorage. */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
}

/** Storage the browser refuses (cookies blocked, some private modes): every call throws. */
export function blockedStorage(): Storage {
  const deny = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return {
    get length() {
      return deny();
    },
    clear: deny,
    getItem: deny,
    key: deny,
    removeItem: deny,
    setItem: deny,
  };
}
