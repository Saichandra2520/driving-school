import { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  TrainingCompletionCertificatePdf,
  type TrainingCertificateData
} from '@/components/certificates/TrainingCompletionCertificatePdf';

type DownloadTrainingCertificateButtonProps = {
  data: TrainingCertificateData;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm';
  label?: string;
  onError?: (message: string) => void;
};

function safeFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateCertificateFileName(data: TrainingCertificateData): string {
  return `training-certificate-${safeFilePart(data.studentName)}-${safeFilePart(data.courseType)}.pdf`;
}

export function DownloadTrainingCertificateButton({
  data,
  variant = 'outline',
  size = 'sm',
  label = 'Download Certificate',
  onError
}: DownloadTrainingCertificateButtonProps): JSX.Element {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async (): Promise<void> => {
    setIsGenerating(true);

    try {
      const blob = await pdf(<TrainingCompletionCertificatePdf data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = generateCertificateFileName(data);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate training certificate.';
      onError?.(message || 'Unable to generate training certificate.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={() => void handleDownload()} disabled={isGenerating}>
      {isGenerating ? (
        'Preparing certificate...'
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          {label}
        </>
      )}
    </Button>
  );
}
