import type { ReactNode } from 'react';
import { FormError } from '@/components/form/form-error';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Omit for an informational dialog that only has a close button. */
  confirmLabel?: string;
  pendingLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  error?: string | undefined;
  /** E.g. "type the name to confirm"; the confirm button stays enabled and validates. */
  children?: ReactNode;
  onConfirm?: () => void;
}

/**
 * Confirmation for consequential actions (remove, leave, archive). Plain local state, not a
 * URL-driven modal: a confirmation should not survive a reload or a shared link.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  pending = false,
  error,
  children,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>{confirmLabel ? 'Cancel' : 'Close'}</AlertDialogCancel>
          {confirmLabel && (
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
