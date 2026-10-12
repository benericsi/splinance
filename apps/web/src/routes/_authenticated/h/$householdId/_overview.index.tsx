import { createFileRoute } from '@tanstack/react-router';

/** /h/:id itself: the overview layout renders the page; nothing on top. */
export const Route = createFileRoute('/_authenticated/h/$householdId/_overview/')({
  component: () => null,
});
