export const getCachedData = <T>(key: string): T | null => {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  
  try {
    const { data, timestamp } = JSON.parse(cached);
    // Simple TTL: 24 hours
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch (e) {
    localStorage.removeItem(key);
    return null;
  }
};

export const setCachedData = <T>(key: string, data: T) => {
  localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
};
