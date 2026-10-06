export type SaveStatus = "saved" | "declined";

/**
 * Hands a generated file to the browser as a download.
 * The single-file preview build swaps this module for one that uses the chat viewer's
 * download prompt (preview/src/shims/save-file.ts).
 */
export async function saveFile(filename: string, data: ArrayBuffer, type: string): Promise<SaveStatus> {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
}
