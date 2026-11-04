import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';

/** Account deletion, like the household danger zone; the dialog explains what happens. */
export function DangerZoneCard() {
  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-medium">Delete account</p>
          <p className="text-muted-foreground text-sm">
            Your sign-in and private data are erased. Shared entries stay for the others, as Former
            member.
          </p>
        </div>
        <Link
          to="/account/delete"
          state={OPEN_MODAL_STATE}
          className={cn(buttonVariants({ variant: 'destructive' }))}
        >
          Delete account…
        </Link>
      </CardContent>
    </Card>
  );
}
