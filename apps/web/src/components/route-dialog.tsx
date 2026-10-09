import { type ReactNode, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query';

interface RouteDialogProps {
  title: string;
  description?: ReactNode;
  /** Called after the close animation; navigate away here (see useCloseModal). */
  onClose: () => void;
  children: ReactNode;
}

/**
 * The shell for URL-driven modals: always open while its route or search param is active.
 * A dialog on larger screens, a bottom drawer (swipe to dismiss) on phones.
 */
export function RouteDialog({ title, description, onClose, children }: RouteDialogProps) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  // Closing first plays the exit animation, then hands over to the router.
  const [open, setOpen] = useState(true);
  const onOpenChange = (next: boolean) => {
    if (!next) setOpen(false);
  };
  const onOpenChangeComplete = (next: boolean) => {
    if (!next) onClose();
  };

  if (isPhone) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        onOpenChangeComplete={onOpenChangeComplete}
        showSwipeHandle
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
