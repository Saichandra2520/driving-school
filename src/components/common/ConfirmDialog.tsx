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
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm
}: ConfirmDialogProps): JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      {open ? (
        <AlertDialogContent onClose={onCancel} className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
