import { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentReceiptPdf } from '@/components/receipts/PaymentReceiptPdf';
import { receiptService } from '@/services/receiptService';

type DownloadReceiptButtonProps = {
  studentId: string;
  receiptNo: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
  loadingLabel?: string;
  onError?: (message: string) => void;
};

export function DownloadReceiptButton({
  studentId,
  receiptNo,
  variant = 'outline',
  size = 'sm',
  label = 'Download PDF Receipt',
  loadingLabel = 'Preparing receipt...',
  onError
}: DownloadReceiptButtonProps): JSX.Element {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async (): Promise<void> => {
    setIsGenerating(true);

    try {
      const receiptData = await receiptService.getReceiptData(studentId, receiptNo);
      const blob = await pdf(<PaymentReceiptPdf data={receiptData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = receiptService.generateReceiptFileName(receiptData);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate receipt.';
      onError?.(message || 'Unable to generate receipt.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={() => void handleDownload()} disabled={isGenerating}>
      {isGenerating ? (
        loadingLabel
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          {label}
        </>
      )}
    </Button>
  );
}
