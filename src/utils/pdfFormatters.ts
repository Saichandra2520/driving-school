export function formatPdfInrCurrency(amount: number): string {
  const numericAmount = Number(amount || 0);
  const formattedAmount = Math.abs(numericAmount).toLocaleString('en-IN', {
    maximumFractionDigits: 0
  });

  return `${numericAmount < 0 ? '-' : ''}Rs ${formattedAmount}`;
}
