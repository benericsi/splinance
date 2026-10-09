import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, HousePlus, Link2, type LucideIcon } from 'lucide-react';
import { OnboardingLayout } from '@/features/onboarding/components/onboarding-layout';
import { useAuth } from '@/lib/auth-store';

/** Step 1: create a household or join one with an invite link. */
export const Route = createFileRoute('/_authenticated/welcome/')({
  component: WelcomePage,
});

function WelcomePage() {
  const { user } = useAuth();

  return (
    <OnboardingLayout
      step={1}
      steps={4}
      title={`Welcome, ${user?.displayName ?? ''}`}
      description="Splinance keeps shared expenses fair. It all happens in a household."
    >
      <div className="space-y-3">
        <Choice
          to="/welcome/household"
          icon={HousePlus}
          title="Create a household"
          description="For you and the people you share costs with."
        />
        <Choice
          to="/welcome/join"
          icon={Link2}
          title="Join with an invite link"
          description="Someone already invited you."
        />
      </div>
    </OnboardingLayout>
  );
}

function Choice({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: '/welcome/household' | '/welcome/join';
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-4 rounded-xl border p-4 outline-none focus-visible:ring-[3px]"
    >
      <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{description}</span>
      </span>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </Link>
  );
}
