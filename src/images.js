// Decodifica un archivo de imagen respetando la orientación EXIF.
async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Algunos navegadores no decodifican ciertos formatos así; se intenta con <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Reduce la imagen a un tamaño razonable y la devuelve como canvas.
async function toCanvas(file, { maxSide, square = false }) {
  const src = await decode(file);
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  if (!sw || !sh) throw new Error('Imagen vacía');

  let sx = 0;
  let sy = 0;
  let cw = sw;
  let ch = sh;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    cw = ch = side;
  }

  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cw * scale));
  canvas.height = Math.max(1, Math.round(ch * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
  src.close?.();
  return canvas;
}

export async function processImage(file) {
  const canvas = await toCanvas(file, { maxSide: 1440 });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('No se pudo codificar la imagen');
  return { blob, w: canvas.width, h: canvas.height };
}

export async function processAvatar(file) {
  const canvas = await toCanvas(file, { maxSide: 320, square: true });
  return canvas.toDataURL('image/jpeg', 0.85);
}
