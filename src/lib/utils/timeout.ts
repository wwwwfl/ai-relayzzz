/**
 * Wraps a promise in a timeout. Resolves to the promise result,
 * or the default value if the timeout expires or the promise rejects.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  defaultValue: T,
  label = 'Promise'
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[Timeout] ${label} timed out after ${timeoutMs}ms. Falling back.`);
      resolve(defaultValue);
    }, timeoutMs);
  });

  try {
    // Catch rejections so they behave like timeouts (graceful degradation)
    const safePromise = promise.catch((err) => {
      console.error(`[Error] ${label} rejected:`, err);
      return defaultValue;
    });
    
    return await Promise.race([safePromise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
