// Preview version of src/lib/save-file.ts. Inside the claude.ai viewer, pages cannot start
// downloads themselves; the `downloads` capability asks the viewer to confirm the save instead.
import { saveFile as browserSave, type SaveStatus } from "../../../src/lib/save-file";

type Downloads = { save(req: { filename: string; data: ArrayBuffer }): Promise<{ status: string }> };
type ClaudeHost = { use(name: "downloads"): Promise<Downloads | null> };

export type { SaveStatus };

export async function saveFile(filename: string, data: ArrayBuffer, type: string): Promise<SaveStatus> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  const downloads = host ? await host.use("downloads").catch(() => null) : null;
  // Opened as a plain file outside the viewer: a normal browser download works.
  if (!downloads) return browserSave(filename, data, type);
  try {
    await downloads.save({ filename, data });
    return "saved";
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "declined") return "declined";
    if (code === "rate_limited") throw new Error("A save prompt is already open. Finish it, then try again.");
    throw new Error("Saving files is not available in this view.");
  }
}
