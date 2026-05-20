import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { receiptService } from '@/services/receiptService';
import { createReceiptWhatsAppMessage, openWhatsAppMessage } from '@/utils/whatsapp';

type WhatsAppReceiptButtonProps = {
  studentId: string;
  receiptNo: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
  onError?: (message: string) => void;
};

export function WhatsAppReceiptButton({
  studentId,
  receiptNo,
  variant = 'outline',
  size = 'sm',
  label = 'Send WhatsApp Text',
  onError
}: WhatsAppReceiptButtonProps): JSX.Element {
  const [isPreparing, setIsPreparing] = useState(false);

  const handleShare = async (): Promise<void> => {
    setIsPreparing(true);

    try {
      const receiptData = await receiptService.getReceiptData(studentId, receiptNo);
      const message = createReceiptWhatsAppMessage(receiptData);
      await openWhatsAppMessage(receiptData.student.phone, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to prepare WhatsApp message.';
      onError?.(message || 'Unable to prepare WhatsApp message.');
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={() => void handleShare()} disabled={isPreparing}>
      {isPreparing ? 'Preparing...' : label}
    </Button>
  );
}
