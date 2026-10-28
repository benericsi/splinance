import { buildDemoStory, renderDemoBankFiles } from '@splinance/shared';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Local date, `YYYY-MM-DD` (en-CA formats it that way). */
const localToday = () => new Intl.DateTimeFormat('en-CA').format(new Date());

/**
 * Demo site only: a made-up Revolut export of this month (from a fresh story, so its rows
 * are new to the household), handed to the import as if it were picked from disk.
 */
export function SampleExportButton({
  onFile,
  disabled = false,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const useSample = () => {
    const story = buildDemoStory({
      seed: Math.floor(Math.random() * 2 ** 31),
      today: localToday(),
    });
    const sample = renderDemoBankFiles(story)
      .filter((file) => file.source === 'revolut')
      .at(-1);
    if (sample) onFile(new File([sample.text], `sample-${sample.fileName}`, { type: 'text/csv' }));
  };

  return (
    <Button variant="outline" className="self-center" disabled={disabled} onClick={useSample}>
      <FlaskConical aria-hidden />
      No export at hand? Try a sample one
    </Button>
  );
}
