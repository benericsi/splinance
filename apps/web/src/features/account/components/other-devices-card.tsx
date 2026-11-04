import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { useRevokeOtherSessions } from '../hooks';

/** Signs out every other session (a lost phone, a shared computer); this one stays. */
export function OtherDevicesCard() {
  const revoke = useRevokeOtherSessions();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <CardTitle>Other devices</CardTitle>
          <p className="text-muted-foreground text-sm">
            Sign out everywhere except here. It takes effect within 15 minutes.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={revoke.isPending}
          onClick={() => {
            revoke.mutate(undefined, {
              onSuccess: (revoked) => {
                toast.success(
                  revoked === 0
                    ? 'No other devices were signed in'
                    : `Signed out of ${String(revoked)} other ${revoked === 1 ? 'device' : 'devices'}`,
                );
              },
            });
          }}
        >
          {revoke.isPending ? 'Signing out…' : 'Sign out other devices'}
        </Button>
      </CardContent>
    </Card>
  );
}
