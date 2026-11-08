// Decode a real selected/camera image before uploading; never store data URLs.
export const MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_MENU_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_MENU_IMAGE_DIMENSION = 1600;
const MAX_IMAGE_PIXELS = 60_000_000;
const fail = code => Object.assign(new Error(code), { code });
const ascii = (bytes, start, end) => String.fromCharCode(...bytes.slice(start, end));

function supportedImage(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return true;
  if ([137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return true;
  if (ascii(bytes,0,4) === 'RIFF' && ascii(bytes,8,12) === 'WEBP') return true;
  if (ascii(bytes,4,8) !== 'ftyp') return false;
  const brands = [ascii(bytes,8,12)];
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) brands.push(ascii(bytes,offset,offset+4));
  if (brands.some(brand => ['avif','avis'].includes(brand))) return false;
  return brands.some(brand => ['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1'].includes(brand));
}

function browserEnvironment(overrides) {
  return {
    createImageBitmap: globalThis.createImageBitmap?.bind(globalThis),
    createCanvas: () => globalThis.document?.createElement('canvas'),
    createImage: () => new globalThis.Image(),
    createObjectURL: file => globalThis.URL.createObjectURL(file),
    revokeObjectURL: url => globalThis.URL.revokeObjectURL(url),
    ...overrides,
  };
}

async function decode(file, browser) {
  if (browser.createImageBitmap) {
    try {
      const bitmap = await browser.createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close?.() };
    } catch { /* Safari and some HEIF decoders need the image element path. */ }
  }
  let image;
  let url;
  const dispose = () => {
    if (image) { image.onload = null; image.onerror = null; image.src = ''; }
    if (url) { browser.revokeObjectURL(url); url = null; }
  };
  try {
    url = browser.createObjectURL(file);
    image = browser.createImage();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(fail('image-decode'));
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, dispose };
  } catch { dispose(); throw fail('image-decode'); }
}

async function encode(canvas, quality) {
  let blob;
  try { blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality)); }
  catch { throw fail('image-encode'); }
  if (!blob || blob.type !== 'image/webp' || blob.size < 12) throw fail('image-encode');
  const header = new Uint8Array(await blob.slice(0,12).arrayBuffer());
  if (ascii(header,0,4) !== 'RIFF' || ascii(header,8,12) !== 'WEBP') throw fail('image-encode');
  return blob;
}

export async function prepareMenuImage(file, overrides = {}) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || typeof file.slice !== 'function') throw fail('image-type');
  if (file.size > MAX_INPUT_IMAGE_BYTES) throw fail('image-too-large');
  let header;
  try { header = new Uint8Array(await file.slice(0,64).arrayBuffer()); }
  catch { throw fail('image-decode'); }
  if (!supportedImage(header)) throw fail('image-type');
  const browser = browserEnvironment(overrides);
  const decoded = await decode(file, browser);
  let canvas;
  try {
    const { width, height } = decoded;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw fail('image-decode');
    if (width * height > MAX_IMAGE_PIXELS) throw fail('image-too-large');
    const scale = Math.min(1, MAX_MENU_IMAGE_DIMENSION / Math.max(width,height));
    let outputWidth = Math.max(1,Math.round(width * scale));
    let outputHeight = Math.max(1,Math.round(height * scale));
    canvas = browser.createCanvas();
    const context = canvas?.getContext('2d');
    if (!context || typeof canvas.toBlob !== 'function') throw fail('image-encode');
    const draw = () => {
      canvas.width = outputWidth; canvas.height = outputHeight;
      context.drawImage(decoded.image,0,0,outputWidth,outputHeight);
    };
    draw();
    for (const quality of [0.84,0.7,0.56]) {
      const result = await encode(canvas,quality);
      if (result.size <= MAX_MENU_IMAGE_BYTES) return result;
    }
    for (let step = 0; step < 4; step++) {
      outputWidth = Math.max(1,Math.round(outputWidth * 0.75));
      outputHeight = Math.max(1,Math.round(outputHeight * 0.75));
      draw();
      const result = await encode(canvas,0.7);
      if (result.size <= MAX_MENU_IMAGE_BYTES) return result;
    }
    throw fail('image-encode');
  } catch (error) {
    if (error?.code) throw error;
    throw fail('image-encode');
  } finally {
    decoded.dispose();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
