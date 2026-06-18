// Sharing helpers: clipboard copy and QR code generation for the room URL.
import QRCode from 'qrcode';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Render the URL as a QR code data-URL (PNG) for display/sharing. */
export function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 240, margin: 1 });
}
