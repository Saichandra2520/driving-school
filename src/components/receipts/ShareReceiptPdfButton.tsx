import { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { PaymentReceiptPdf } from '@/components/receipts/PaymentReceiptPdf';
import { Button } from '@/components/ui/button';
import { receiptService } from '@/services/receiptService';
import { createReceiptWhatsAppMessage, openWhatsAppMessage } from '@/utils/whatsapp';

type ShareReceiptPdfButtonProps = {
  studentId: string;
  receiptNo: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
  onError?: (message: string) => void;
};

export function ShareReceiptPdfButton({
  studentId,
  receiptNo,
  variant = 'outline',
  size = 'sm',
  label = 'Share PDF + Text',
  onError
}: ShareReceiptPdfButtonProps): JSX.Element {
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async (): Promise<void> => {
    setIsSharing(true);

    try {
      const receiptData = await receiptService.getReceiptData(studentId, receiptNo);
      const blob = await pdf(<PaymentReceiptPdf data={receiptData} />).toBlob();
      const file = new File([blob], receiptService.generateReceiptFileName(receiptData), {
        type: 'application/pdf'
      });
      const message = createReceiptWhatsAppMessage(receiptData);

      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          title: `Payment Receipt ${receiptNo}`,
          text: message,
          files: [file]
        });
        return;
      }

      downloadBlob(blob, file.name);
      await openWhatsAppMessage(receiptData.student.phone, message);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const message = error instanceof Error ? error.message : 'Unable to share PDF receipt.';
      onError?.(message || 'Unable to share PDF receipt.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={() => void handleShare()} disabled={isSharing}>
      {isSharing ? 'Preparing PDF...' : label}
    </Button>
  );
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
