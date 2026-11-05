import { FileUp } from 'lucide-react';
import { type DragEvent, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Pick or drop one CSV export. A real file input inside the label, visually hidden, so the
 * keyboard and screen readers get the native control.
 */
export function FileDrop({
  onFile,
  disabled = false,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('imports');
  const id = useId();
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <label
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
      className={cn(
        'has-focus-visible:ring-ring/50 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center has-focus-visible:ring-[3px]',
        dragging && 'border-primary bg-muted/60',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <FileUp className="text-muted-foreground size-6" aria-hidden />
      <span>
        <Trans t={t} i18nKey="drop.prompt" components={{ a: <span className="text-link" /> }} />
      </span>
      <span className="text-muted-foreground text-sm">{t('drop.hint')}</span>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv,text/tab-separated-values"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          // Picking the same file again (after an undo) fires change again.
          event.target.value = '';
        }}
      />
    </label>
  );
}
