import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  confirmDisabled = false,
  cancelDisabled = false,
  onCancel,
  onConfirm
}: ConfirmDialogProps): JSX.Element {
  const handleCancel = (): void => {
    if (!cancelDisabled) onCancel();
  };

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleCancel()}>
      {open ? (
        <AlertDialogContent onClose={handleCancel} className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={cancelDisabled}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={confirmDisabled}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
