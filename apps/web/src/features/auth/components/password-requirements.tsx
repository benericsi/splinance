import { checkPassword, type PasswordContext, type PasswordRuleResult } from '@splinance/shared';
import { Check, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordRequirementsProps {
  password: string;
  context: PasswordContext;
  /** After a submit attempt, unmet required rules turn red instead of neutral. */
  showFailures: boolean;
}

function RuleItem({ result, showFailure }: { result: PasswordRuleResult; showFailure: boolean }) {
  const { rule, passed } = result;
  const failed = !passed && showFailure && rule.required;
  const Icon = passed ? Check : rule.required ? X : Circle;

  return (
    <li
      className={cn(
        'flex items-center gap-2 text-sm transition-colors',
        passed && 'text-emerald-600 dark:text-emerald-400',
        failed && 'text-destructive',
        !passed && !failed && 'text-muted-foreground',
      )}
    >
      <Icon className={cn('size-4 shrink-0', !passed && !rule.required && 'size-3')} aria-hidden />
      <span>{rule.label}</span>
      <span className="sr-only">{passed ? '(met)' : '(not met)'}</span>
    </li>
  );
}

/** Live checklist driven by the same shared rules the API enforces. */
export function PasswordRequirements({
  password,
  context,
  showFailures,
}: PasswordRequirementsProps) {
  const results = checkPassword(password, context);
  const required = results.filter((r) => r.rule.required);
  const recommended = results.filter((r) => !r.rule.required);

  return (
    <div className="space-y-3 pt-1">
      <ul aria-label="Password requirements" className="space-y-1.5">
        {required.map((r) => (
          <RuleItem key={r.rule.id} result={r} showFailure={showFailures} />
        ))}
      </ul>
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Makes it stronger
        </p>
        <ul aria-label="Password recommendations" className="space-y-1.5">
          {recommended.map((r) => (
            <RuleItem key={r.rule.id} result={r} showFailure={false} />
          ))}
        </ul>
      </div>
    </div>
  );
}
