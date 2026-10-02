import fs from 'fs';
import path from 'path';

/**
 * Saves a Base64 data URL to the public/uploads directory
 * and returns the relative public URL (e.g. /uploads/slips/slip_123.jpg).
 * If the input is already a URL or path, it returns it unchanged.
 */
export function saveBase64Image(
  dataUri: string | null | undefined,
  folder: string,
  prefix: string
): string | null {
  if (!dataUri || typeof dataUri !== 'string') return null;

  // If already a URL or file path, return as is
  if (!dataUri.startsWith('data:image/')) {
    return dataUri;
  }

  try {
    const commaIdx = dataUri.indexOf(',');
    if (commaIdx === -1) return dataUri;

    const meta = dataUri.substring(0, commaIdx);
    const base64Data = dataUri.substring(commaIdx + 1).replace(/\s/g, '');
    if (!base64Data) return null;

    const extMatch = meta.match(/data:image\/([a-zA-Z0-9\-\+]+)/);
    const rawExt = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const buffer = Buffer.from(base64Data, 'base64');

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', folder);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = `${prefix}_${Date.now()}_${randomSuffix}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, buffer);
    return `/uploads/${folder}/${filename}`;
  } catch (err) {
    console.error(`[saveBase64Image Error] Folder: ${folder}, Prefix: ${prefix}:`, err);
    // If file writing fails, return original dataUri as fallback
    return dataUri;
  }
}
