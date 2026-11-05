import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { QrCode } from '@/components/qr-code';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { inviteLink } from '../pending-invite';

/**
 * A freshly created invite: QR code, the link and a copy button. Shown right after the
 * create call, the only time the raw token is known (invite dialog and onboarding).
 */
export function InviteLinkCard({ token, householdName }: { token: string; householdName: string }) {
  const { t } = useTranslation('invites');
  const link = inviteLink(token);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  return (
    <div className="space-y-4">
      <QrCode
        value={link}
        label={t('qr', { household: householdName })}
        className="mx-auto size-44"
      />
      <div className="flex gap-2">
        <Input
          readOnly
          value={link}
          aria-label={t('link')}
          className="h-10 font-mono text-xs"
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
        <Button
          className="h-10"
          onClick={() => {
            navigator.clipboard.writeText(link).then(
              () => {
                setCopied(true);
              },
              () => {
                toast.error(t('copyFailed'));
              },
            );
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">{t('shownOnce')}</p>
    </div>
  );
}
