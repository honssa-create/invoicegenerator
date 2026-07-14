/**
 * Client-side helper: upload an image to Cloudflare R2 via POST /api/upload.
 * Returns the public URL to store in SQLite or form state.
 */
export async function uploadImageToR2(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Upload failed');
  }

  if (!data.url || typeof data.url !== 'string') {
    throw new Error('Upload succeeded but no URL was returned');
  }

  return data.url;
}
