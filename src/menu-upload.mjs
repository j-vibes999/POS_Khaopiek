export const MENU_IMAGE_BUCKET = 'pos-menu-images';
export const MAX_MENU_UPLOAD_BYTES = 2 * 1024 * 1024;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const objectPath = new RegExp(`^${uuid}/${uuid}\\.webp$`, 'i');
const fail = code => Object.assign(new Error(code), { code });

export function validateMenuImageTicket(ticket) {
  if (!ticket || ticket.bucket !== MENU_IMAGE_BUCKET || typeof ticket.path !== 'string' || !objectPath.test(ticket.path)) throw fail('invalid-response');
  return { bucket: ticket.bucket, path: ticket.path };
}

export function assertWebpHeader(bytes, length) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (length < 20 || bytes.length < 16 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP'
    || !['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 16))) throw fail('image-type');
  const declaredLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8;
  if (declaredLength !== length) throw fail('image-type');
}

export async function assertMenuImage(blob) {
  if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 20 || blob.type !== 'image/webp' || typeof blob.slice !== 'function') throw fail('image-type');
  if (blob.size > MAX_MENU_UPLOAD_BYTES) throw fail('image-too-large');
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  assertWebpHeader(header, blob.size);
  return blob;
}
