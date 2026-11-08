/** Save bytes as a file using a temporary object URL. Nothing leaves the device. */
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
