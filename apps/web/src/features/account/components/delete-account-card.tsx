import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { CONTACT_EMAIL } from '@/lib/contact';

/** Deletion is not self-service yet (docs/architecture.md section 15): ask by email. */
export function DeleteAccountCard() {
  return (
    <Card>
      <CardContent className="space-y-1">
        <CardTitle>Delete account</CardTitle>
        <p className="text-muted-foreground text-sm">
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-link underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{' '}
          and your account is deleted within a month. What is kept and why is in the{' '}
          <Link to="/privacy" className="text-link underline underline-offset-4">
            privacy notice
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
