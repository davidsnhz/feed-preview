import Sortable from 'sortablejs';
import './style.css';
import * as db from './db.js';
import { processAvatar, processImage } from './images.js';

const $ = (id) => document.getElementById(id);

const PERSON_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8.5" r="4.2"/><path d="M3.5 21c0-4.4 3.8-7 8.5-7s8.5 2.6 8.5 7z"/></svg>';

const DEFAULT_PROFILE = {
  username: 'tu_usuario',
  name: 'Tu nombre',
  bio: '',
  followers: '0',
  following: '0',
  avatar: '',
};
const DEFAULT_SETTINGS = { ratio: '3:4', theme: 'auto' };

// ---------- Estado ----------

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const state = {
  photos: new Map(), // id -> { id, blob, w, h, posX, posY, url }
  order: [], // ids, la primera es la foto más reciente (arriba a la izquierda)
  profile: { ...DEFAULT_PROFILE, ...loadJSON('fp.profile', {}) },
  settings: { ...DEFAULT_SETTINGS, ...loadJSON('fp.settings', {}) },
};

const saveOrder = () => saveJSON('fp.order', state.order);
const saveSettings = () => saveJSON('fp.settings', state.settings);

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function toRecord(photo) {
  const { url, ...record } = photo;
  return record;
}

function register(record) {
  const photo = { ...record, url: URL.createObjectURL(record.blob) };
  state.photos.set(photo.id, photo);
  return photo;
}

// ---------- Aviso (toast) ----------

const toast = $('toast');
let toastTimer;

function hideToast() {
  clearTimeout(toastTimer);
  toast.classList.remove('show');
}

function showToast(message, { action, onAction, duration = 3200 } = {}) {
  clearTimeout(toastTimer);
  $('toastMsg').textContent = message;
  const btn = $('toastBtn');
  btn.hidden = !action;
  btn.textContent = action ?? '';
  btn.onclick = action
    ? () => {
        hideToast();
        onAction();
      }
    : null;
  toast.classList.add('show');
  if (duration) toastTimer = setTimeout(hideToast, duration);
}

// ---------- Diálogos ----------

for (const dialog of document.querySelectorAll('dialog')) {
  // Cierra al tocar fuera, pero solo si el toque empezó fuera (no al soltar un arrastre).
  let downOnBackdrop = false;
  dialog.addEventListener('pointerdown', (e) => {
    downOnBackdrop = e.target === dialog;
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && downOnBackdrop) dialog.close();
    else if (e.target.closest('[data-close]')) dialog.close();
  });
}

function confirmAction(message, okLabel = 'Borrar') {
  const dialog = $('confirmDialog');
  $('confirmMsg').textContent = message;
  $('confirmOk').textContent = okLabel;
  return new Promise((resolve) => {
    let result = false;
    $('confirmOk').onclick = () => {
      result = true;
      dialog.close();
    };
    $('confirmCancel').onclick = () => dialog.close();
    dialog.addEventListener('close', () => resolve(result), { once: true });
    dialog.showModal();
  });
}

// ---------- Perfil ----------

function renderAvatar(el, dataUrl) {
  if (dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    img.alt = '';
    el.replaceChildren(img);
  } else {
    el.innerHTML = PERSON_SVG;
  }
}

function renderProfile() {
  const p = state.profile;
  $('username').textContent = p.username || DEFAULT_PROFILE.username;
  $('displayName').textContent = p.name;
  $('displayName').hidden = !p.name;
  $('bio').textContent = p.bio;
  $('bio').hidden = !p.bio;
  $('statFollowers').textContent = p.followers || '0';
  $('statFollowing').textContent = p.following || '0';
  renderAvatar($('avatarBtn'), p.avatar);
}

let draftAvatar = '';

function openProfileDialog() {
  const p = state.profile;
  draftAvatar = p.avatar;
  $('fUsername').value = p.username;
  $('fName').value = p.name;
  $('fBio').value = p.bio;
  $('fFollowers').value = p.followers;
  $('fFollowing').value = p.following;
  renderAvatar($('avatarPreview'), draftAvatar);
  $('removeAvatarBtn').hidden = !draftAvatar;
  $('profileDialog').showModal();
}

$('usernameBtn').addEventListener('click', openProfileDialog);
$('avatarBtn').addEventListener('click', openProfileDialog);
$('editProfileBtn').addEventListener('click', openProfileDialog);

$('changeAvatarBtn').addEventListener('click', () => $('avatarInput').click());
$('removeAvatarBtn').addEventListener('click', () => {
  draftAvatar = '';
  renderAvatar($('avatarPreview'), '');
  $('removeAvatarBtn').hidden = true;
});

$('avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    draftAvatar = await processAvatar(file);
    renderAvatar($('avatarPreview'), draftAvatar);
    $('removeAvatarBtn').hidden = false;
  } catch {
    showToast('No se pudo leer esa imagen');
  }
});

$('profileForm').addEventListener('submit', (e) => {
  e.preventDefault();
  state.profile = {
    username: $('fUsername').value.trim().replace(/\s+/g, '_') || DEFAULT_PROFILE.username,
    name: $('fName').value.trim(),
    bio: $('fBio').value.trim(),
    followers: $('fFollowers').value.trim() || '0',
    following: $('fFollowing').value.trim() || '0',
    avatar: draftAvatar,
  };
  if (!saveJSON('fp.profile', state.profile)) {
    showToast('No se pudo guardar el perfil en este dispositivo');
  }
  renderProfile();
  $('profileDialog').close();
});

// ---------- Cuadrícula ----------

const grid = $('grid');

function makeCell(photo) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.id = photo.id;
  cell.tabIndex = 0;
  cell.setAttribute('role', 'button');
  cell.setAttribute('aria-label', 'Foto del feed');
  const img = new Image();
  img.src = photo.url;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.style.objectPosition = `${photo.posX}% ${photo.posY}%`;
  cell.append(img);
  return cell;
}

function renderGrid() {
  grid.replaceChildren(...state.order.map((id) => makeCell(state.photos.get(id))));
  const count = state.order.length;
  grid.hidden = count === 0;
  $('empty').hidden = count > 0;
  $('gridHint').hidden = count === 0;
  $('statPosts').textContent = count;
}

let dragging = false;

Sortable.create(grid, {
  animation: 200,
  delay: 220,
  delayOnTouchOnly: true,
  touchStartThreshold: 5,
  forceFallback: true,
  fallbackTolerance: 5,
  ghostClass: 'cell-ghost',
  dragClass: 'cell-drag',
  onStart() {
    dragging = true;
    navigator.vibrate?.(10);
  },
  onEnd() {
    state.order = [...grid.querySelectorAll('.cell')]
      .map((cell) => cell.dataset.id)
      .filter((id, i, all) => state.photos.has(id) && all.indexOf(id) === i);
    saveOrder();
    setTimeout(() => (dragging = false), 60);
  },
});

grid.addEventListener('click', (e) => {
  if (dragging) return;
  const cell = e.target.closest('.cell');
  if (cell) openPhoto(cell.dataset.id);
});

grid.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  e.preventDefault();
  openPhoto(cell.dataset.id);
});

grid.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Añadir fotos ----------

const isImage = (file) => file.type.startsWith('image/') || /\.(heic|heif|avif)$/i.test(file.name);

let adding = false;

async function addFiles(fileList) {
  const files = [...fileList].filter(isImage);
  if (!files.length || adding) return;
  adding = true;
  showToast(files.length === 1 ? 'Añadiendo foto…' : `Añadiendo ${files.length} fotos…`, {
    duration: 0,
  });

  const added = [];
  let failed = 0;
  for (const file of files) {
    try {
      const { blob, w, h } = await processImage(file);
      const record = { id: newId(), blob, w, h, posX: 50, posY: 50 };
      await db.putPhoto(record);
      register(record);
      added.push(record.id);
    } catch {
      failed++;
    }
  }

  // Las nuevas van al principio, como una publicación recién subida.
  state.order = [...added, ...state.order];
  saveOrder();
  renderGrid();
  adding = false;
  navigator.storage?.persist?.().catch(() => {});

  if (failed && !added.length) {
    showToast(failed === 1 ? 'No se pudo leer esa imagen' : 'No se pudieron leer esas imágenes');
  } else if (failed) {
    showToast(
      `Añadidas ${added.length}; ${failed === 1 ? '1 no se pudo leer' : `${failed} no se pudieron leer`}`,
    );
  } else {
    showToast(added.length === 1 ? 'Foto añadida' : `${added.length} fotos añadidas`, {
      duration: 1800,
    });
  }
}

for (const id of ['addBtn', 'addBtnTop', 'addBtnEmpty']) {
  $(id).addEventListener('click', () => $('fileInput').click());
}

$('fileInput').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  addFiles(files);
});

// Arrastrar archivos desde el ordenador o pegarlos también funciona.
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});
window.addEventListener('paste', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.clipboardData?.files.length) addFiles(e.clipboardData.files);
});

// ---------- Foto: encuadre, reemplazar, mover, eliminar ----------

const photoDialog = $('photoDialog');
const frame = $('photoFrame');
const photoImg = $('photoImg');
let currentId = null;

const currentPhoto = () => state.photos.get(currentId);

function applyPosition(photo) {
  const position = `${photo.posX}% ${photo.posY}%`;
  photoImg.style.objectPosition = position;
  const cellImg = grid.querySelector(`.cell[data-id="${photo.id}"] img`);
  if (cellImg) cellImg.style.objectPosition = position;
}

// Cuánto sobresale la foto del marco (en px) en cada eje.
function overflow(photo) {
  const rect = frame.getBoundingClientRect();
  const scale = Math.max(rect.width / photo.w, rect.height / photo.h);
  return { x: photo.w * scale - rect.width, y: photo.h * scale - rect.height };
}

function refreshPhotoDialog() {
  const photo = currentPhoto();
  photoImg.src = photo.url;
  applyPosition(photo);
  const over = overflow(photo);
  $('panHint').hidden = over.x < 1 && over.y < 1;
  $('moveFirstBtn').hidden = state.order[0] === photo.id;
}

function openPhoto(id) {
  if (!state.photos.has(id)) return;
  currentId = id;
  photoDialog.showModal();
  refreshPhotoDialog();
}

let pan = null;

frame.addEventListener('pointerdown', (e) => {
  const photo = currentPhoto();
  if (!photo) return;
  frame.setPointerCapture(e.pointerId);
  frame.classList.add('panning');
  pan = { x: e.clientX, y: e.clientY, posX: photo.posX, posY: photo.posY, over: overflow(photo) };
});

frame.addEventListener('pointermove', (e) => {
  const photo = currentPhoto();
  if (!pan || !photo) return;
  if (pan.over.x >= 1) {
    photo.posX = clamp(pan.posX - ((e.clientX - pan.x) / pan.over.x) * 100, 0, 100);
  }
  if (pan.over.y >= 1) {
    photo.posY = clamp(pan.posY - ((e.clientY - pan.y) / pan.over.y) * 100, 0, 100);
  }
  applyPosition(photo);
});

function endPan() {
  const photo = currentPhoto();
  if (!pan) return;
  pan = null;
  frame.classList.remove('panning');
  if (photo) db.putPhoto(toRecord(photo)).catch(() => {});
}

frame.addEventListener('pointerup', endPan);
frame.addEventListener('pointercancel', endPan);

$('moveFirstBtn').addEventListener('click', () => {
  state.order = [currentId, ...state.order.filter((id) => id !== currentId)];
  saveOrder();
  renderGrid();
  photoDialog.close();
});

$('replaceBtn').addEventListener('click', () => $('replaceInput').click());

$('replaceInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const photo = currentPhoto();
  if (!file || !photo) return;
  try {
    const { blob, w, h } = await processImage(file);
    URL.revokeObjectURL(photo.url);
    Object.assign(photo, { blob, w, h, posX: 50, posY: 50, url: URL.createObjectURL(blob) });
    await db.putPhoto(toRecord(photo));
    renderGrid();
    if (photoDialog.open) refreshPhotoDialog();
  } catch {
    showToast('No se pudo leer esa imagen');
  }
});

$('deleteBtn').addEventListener('click', async () => {
  const photo = currentPhoto();
  if (!photo) return;
  photoDialog.close();
  const index = state.order.indexOf(photo.id);
  state.order = state.order.filter((id) => id !== photo.id);
  state.photos.delete(photo.id);
  saveOrder();
  renderGrid();
  await db.deletePhoto(photo.id).catch(() => {});

  showToast('Foto eliminada', {
    action: 'Deshacer',
    duration: 5000,
    onAction: async () => {
      await db.putPhoto(toRecord(photo)).catch(() => {});
      state.photos.set(photo.id, photo);
      state.order.splice(clamp(index, 0, state.order.length), 0, photo.id);
      saveOrder();
      renderGrid();
    },
  });
});

// ---------- Formato de la cuadrícula ----------

function applyRatio() {
  const { ratio } = state.settings;
  document.documentElement.style.setProperty('--ratio', ratio === '1:1' ? '1 / 1' : '3 / 4');
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.ratio === ratio));
  }
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    state.settings.ratio = tab.dataset.ratio;
    saveSettings();
    applyRatio();
  });
}

// ---------- Opciones ----------

function applyTheme() {
  const { theme } = state.settings;
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  for (const btn of $('themeSeg').children) {
    btn.setAttribute('aria-pressed', String(btn.dataset.themeValue === theme));
  }
}

$('menuBtn').addEventListener('click', () => $('menuDialog').showModal());

$('themeSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.settings.theme = btn.dataset.themeValue;
  saveSettings();
  applyTheme();
});

$('clearBtn').addEventListener('click', async () => {
  if (!state.order.length) {
    showToast('No hay fotos que borrar');
    $('menuDialog').close();
    return;
  }
  const ok = await confirmAction(
    `¿Borrar las ${state.order.length} fotos del feed? Esta acción no se puede deshacer.`,
    'Borrar todo',
  );
  if (!ok) return;
  await db.clearPhotos().catch(() => {});
  for (const photo of state.photos.values()) URL.revokeObjectURL(photo.url);
  state.photos.clear();
  state.order = [];
  saveOrder();
  renderGrid();
  $('menuDialog').close();
  showToast('Feed vaciado');
});

// Dibuja la cuadrícula en un canvas y la descarga como imagen.
$('exportBtn').addEventListener('click', async () => {
  $('menuDialog').close();
  if (!state.order.length) {
    showToast('Añade fotos primero');
    return;
  }
  const COLS = 3;
  const MAX_ROWS = 30; // límite de tamaño de canvas en móviles
  const WIDTH = 1080;
  const GAP = 4;
  const cw = (WIDTH - GAP * (COLS - 1)) / COLS;
  const ch = state.settings.ratio === '1:1' ? cw : (cw * 4) / 3;
  const ids = state.order.slice(0, COLS * MAX_ROWS);
  const rows = Math.ceil(ids.length / COLS);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.round(rows * ch + (rows - 1) * GAP);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';

  try {
    for (const [i, id] of ids.entries()) {
      const photo = state.photos.get(id);
      const img = new Image();
      img.src = photo.url;
      await img.decode();
      const scale = Math.max(cw / photo.w, ch / photo.h);
      const sw = cw / scale;
      const sh = ch / scale;
      const sx = ((photo.w - sw) * photo.posX) / 100;
      const sy = ((photo.h - sh) * photo.posY) / 100;
      const dx = (i % COLS) * (cw + GAP);
      const dy = Math.floor(i / COLS) * (ch + GAP);
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, cw, ch);
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('export');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'feed-preview.jpg';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    showToast(
      ids.length < state.order.length
        ? `Imagen guardada (primeras ${ids.length} fotos)`
        : 'Imagen guardada',
    );
  } catch {
    showToast('No se pudo generar la imagen');
  }
});

// ---------- Arranque ----------

async function init() {
  applyTheme();
  applyRatio();
  renderProfile();

  let records = [];
  try {
    records = await db.getAllPhotos();
  } catch {
    showToast('Este navegador no permite guardar las fotos; se perderán al cerrar', {
      duration: 6000,
    });
  }
  for (const record of records) register(record);

  // Reconciliar el orden guardado con lo que realmente hay en la base de datos.
  const saved = loadJSON('fp.order', []);
  const known = Array.isArray(saved) ? saved.filter((id) => state.photos.has(id)) : [];
  const missing = [...state.photos.keys()].filter((id) => !known.includes(id));
  state.order = [...missing, ...known];
  saveOrder();
  renderGrid();
}

init();
