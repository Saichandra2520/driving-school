export function getFriendlyErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const message = error instanceof Error ? error.message : '';

  if (
    message.toLowerCase().includes('failed to fetch') ||
    message.toLowerCase().includes('network') ||
    message.toLowerCase().includes('fetch')
  ) {
    return 'Unable to connect. Please check your internet connection.';
  }

  return message || fallback;
}
