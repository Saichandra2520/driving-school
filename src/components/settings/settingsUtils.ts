export function formatDateTime(value?: string): string {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function notifyBranchesChanged(): void {
  window.dispatchEvent(new Event('branches-changed'));
}
