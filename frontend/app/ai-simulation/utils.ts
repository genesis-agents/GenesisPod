export function safeJson(
  input: string | object | null | undefined,
  fallback: any
) {
  if (input === null || input === undefined) {
    return fallback;
  }
  // If input is already an object, return it directly
  if (typeof input === 'object') {
    return input;
  }
  // If input is a string, try to parse it
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}
