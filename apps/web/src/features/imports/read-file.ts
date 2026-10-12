/**
 * The text of an export. Banks write UTF-8 today, but older Hungarian exports are often
 * Windows-1250; strict UTF-8 decoding fails on those, and then the legacy encoding is used.
 */
export async function readExport(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1250').decode(bytes);
  }
}
