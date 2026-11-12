import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import JSZip from 'jszip';
import './style.css';

const $ = (id) => document.getElementById(id);
const ffmpeg = new FFmpeg();
let ffmpegReady = false;
let selectedFile = null;
let selectedObjectUrl = null;
let sourceDuration = 0;
let nextBatchStart = 0;
let batchNumber = 0;
let generatedClips = [];
let isProcessing = false;
let currentMode = 'batch';

const els = {
  fileInput: $('videoFile'), dropzone: $('dropzone'), fileCard: $('fileCard'), fileName: $('fileName'), fileDetails: $('fileDetails'),
  removeFile: $('removeFileBtn'), preview: $('videoPreview'), url: $('videoUrl'), loadUrl: $('loadUrlBtn'),
  batchTab: $('batchTab'), customTab: $('customTab'), batchSettings: $('batchSettings'), customSettings: $('customSettings'),
  start: $('startTime'), end: $('endTime'), count: $('clipCount'), rangePreview: $('rangePreview'),
  generate: $('generateBtn'), results: $('resultsPanel'), summary: $('resultsSummary'), grid: $('clipGrid'), zip: $('downloadZipBtn'),
  progressWrap: $('progressWrap'), progressText: $('progressText'), progressPercent: $('progressPercent'), progressBar: $('progressBar'),
  nextBatchWrap: $('nextBatchWrap'), nextBatch: $('nextBatchBtn'), nextBatchText: $('nextBatchText'), status: $('statusMessage'),
  position: $('batchPosition'), positionText: $('batchPositionText')
};

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function parseTime(value) {
  const parts = String(value).trim().split(':').map(Number);
  if (!parts.length || parts.some(n => !Number.isFinite(n) || n < 0)) return NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}
function setStatus(message, type = 'info') {
  els.status.textContent = message;
  els.status.classList.remove('hidden', 'error');
  if (type === 'error') els.status.classList.add('error');
}
function clearStatus() { els.status.classList.add('hidden'); }
function safeName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'video';
}
function updateGenerateLabel() {
  els.generate.innerHTML = currentMode === 'batch'
    ? '<span>✂</span> Generate 10 clips <span class="button-arrow">→</span>'
    : '<span>✂</span> Generate custom clips <span class="button-arrow">→</span>';
  els.generate.disabled = !selectedFile || isProcessing;
}
function updateBatchPosition() {
  if (batchNumber > 0) {
    els.position.classList.remove('hidden');
    els.positionText.textContent = `Batch ${batchNumber + 1} starts at ${formatTime(nextBatchStart)}`;
  } else els.position.classList.add('hidden');
  els.nextBatchText.textContent = `Next batch starts at ${formatTime(nextBatchStart)}.`;
}
function updateRangePreview() {
  const start = parseTime(els.start.value), end = parseTime(els.end.value), count = Number(els.count.value);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start && count > 0) {
    const each = (end - start) / count;
    els.rangePreview.textContent = `${count} clips · ${formatTime(each)} each`;
  } else els.rangePreview.textContent = 'Enter a valid time range and clip count';
}
function setMode(mode) {
  currentMode = mode;
  const batch = mode === 'batch';
  els.batchTab.classList.toggle('active', batch);
  els.customTab.classList.toggle('active', !batch);
  els.batchTab.setAttribute('aria-selected', String(batch));
  els.customTab.setAttribute('aria-selected', String(!batch));
  els.batchSettings.classList.toggle('hidden', !batch);
  els.customSettings.classList.toggle('hidden', batch);
  updateGenerateLabel();
}
function resetGenerated() {
  generatedClips.forEach(c => URL.revokeObjectURL(c.url));
  generatedClips = [];
  els.grid.innerHTML = '';
  els.zip.disabled = true;
  els.results.classList.add('hidden');
  els.nextBatchWrap.classList.add('hidden');
}
function clearSelectedFile() {
  selectedFile = null; sourceDuration = 0; nextBatchStart = 0; batchNumber = 0;
  if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
  selectedObjectUrl = null;
  els.fileInput.value = ''; els.fileCard.classList.add('hidden'); els.preview.classList.add('hidden');
  els.preview.removeAttribute('src'); els.url.value = '';
  resetGenerated(); updateBatchPosition(); updateGenerateLabel();
}
async function acceptFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name)) {
    setStatus('That file does not look like a supported video. Choose a video file.', 'error'); return;
  }
  clearStatus(); resetGenerated();
  if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
  selectedFile = file; nextBatchStart = 0; batchNumber = 0;
  selectedObjectUrl = URL.createObjectURL(file);
  els.fileName.textContent = file.name;
  els.fileDetails.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · Reading duration…`;
  els.fileCard.classList.remove('hidden');
  els.preview.src = selectedObjectUrl; els.preview.classList.remove('hidden');
  try {
    await new Promise((resolve, reject) => {
      const onLoaded = () => { sourceDuration = els.preview.duration; resolve(); };
      const onError = () => reject(new Error('The browser could not read this video. Try MP4 (H.264).'));
      els.preview.addEventListener('loadedmetadata', onLoaded, { once: true });
      els.preview.addEventListener('error', onError, { once: true });
    });
    els.fileDetails.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · ${formatTime(sourceDuration)} long`;
    els.end.value = formatTime(Math.min(300, Math.floor(sourceDuration)));
    updateRangePreview(); updateBatchPosition(); updateGenerateLabel();
    setStatus(`Video ready: ${formatTime(sourceDuration)} total duration.`);
  } catch (err) { clearSelectedFile(); setStatus(err.message, 'error'); }
}

els.fileInput.addEventListener('change', e => acceptFile(e.target.files?.[0]));
els.dropzone.addEventListener('dragover', e => { e.preventDefault(); els.dropzone.classList.add('dragover'); });
els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('dragover'));
els.dropzone.addEventListener('drop', e => { e.preventDefault(); els.dropzone.classList.remove('dragover'); acceptFile(e.dataTransfer.files?.[0]); });
els.removeFile.addEventListener('click', clearSelectedFile);
els.batchTab.addEventListener('click', () => setMode('batch'));
els.customTab.addEventListener('click', () => setMode('custom'));
[els.start, els.end, els.count].forEach(el => el.addEventListener('input', updateRangePreview));
document.querySelectorAll('input[name="aspect"]').forEach(input => input.addEventListener('change', () => {
  document.querySelectorAll('.format-option').forEach(label => label.classList.toggle('selected', label.querySelector('input').checked));
}));

async function loadRemoteVideo() {
  const raw = els.url.value.trim();
  if (!raw) return setStatus('Paste a direct video-file URL first.', 'error');
  let url;
  try { url = new URL(raw); } catch { return setStatus('Enter a valid URL.', 'error'); }
  if (!['http:', 'https:'].includes(url.protocol)) return setStatus('Only HTTP or HTTPS links are supported.', 'error');
  els.loadUrl.disabled = true; els.loadUrl.textContent = 'Loading…'; clearStatus();
  try {
    const response = await fetch(url.href, { mode: 'cors' });
    if (!response.ok) throw new Error(`The video host returned ${response.status}.`);
    const type = response.headers.get('content-type') || '';
    if (type && !type.startsWith('video/') && !type.includes('octet-stream')) {
      throw new Error('That URL returned a web page, not a direct video file. Paste a direct .mp4/.mov/.webm link.');
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('The video file was empty.');
    const ext = url.pathname.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i)?.[1] || 'mp4';
    const name = decodeURIComponent(url.pathname.split('/').pop() || `remote-video.${ext}`).replace(/[^a-z0-9._-]/gi, '_');
    await acceptFile(new File([blob], name, { type: blob.type || `video/${ext}` }));
  } catch (err) {
    const corsHint = err instanceof TypeError ? ' The host may block browser access (CORS); download the video and upload it instead.' : '';
    setStatus(`${err.message}${corsHint}`, 'error');
  } finally { els.loadUrl.disabled = false; els.loadUrl.textContent = 'Load link'; }
}
els.loadUrl.addEventListener('click', loadRemoteVideo);
els.url.addEventListener('keydown', e => { if (e.key === 'Enter') loadRemoteVideo(); });

async function ensureFFmpeg() {
  if (ffmpegReady) return;
  els.progressText.textContent = 'Loading video engine…';
  // Single-threaded core avoids SharedArrayBuffer / cross-origin-isolation requirements.
  const coreBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm')
  });
  ffmpegReady = true;
}
ffmpeg.on('progress', ({ progress }) => {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  els.progressPercent.textContent = `${pct}%`;
});

function addClipCard(clip, index) {
  const card = document.createElement('article'); card.className = 'clip-card';
  const thumb = document.createElement('div'); thumb.className = 'clip-thumb';
  const video = document.createElement('video'); video.src = clip.url; video.muted = true; video.playsInline = true; video.preload = 'metadata';
  thumb.append(video);
  const title = document.createElement('strong'); title.textContent = clip.name;
  const detail = document.createElement('small'); detail.textContent = `${formatTime(clip.start)} – ${formatTime(clip.end)}`;
  const link = document.createElement('a'); link.className = 'clip-download'; link.href = clip.url; link.download = clip.name; link.textContent = '↓ Download MP4';
  card.append(thumb, title, detail, link); els.grid.append(card);
}

async function createClips({ start, end, count, fixedClipSeconds = null }) {
  if (!selectedFile || isProcessing) return;
  if (!(start >= 0 && end > start && end <= sourceDuration + 0.25 && count >= 1 && count <= 100)) {
    setStatus(`Choose a valid range within the ${formatTime(sourceDuration)} video and a clip count between 1 and 100.`, 'error'); return;
  }
  isProcessing = true; updateGenerateLabel(); clearStatus();
  els.results.classList.remove('hidden'); els.progressWrap.classList.remove('hidden');
  els.progressBar.style.width = '0%'; els.progressPercent.textContent = '0%';
  const base = safeName(selectedFile.name), aspect = document.querySelector('input[name="aspect"]:checked').value;
  const segment = fixedClipSeconds || ((end - start) / count);
  const newClips = [];
  const firstClipNumber = generatedClips.length + 1;
  try {
    await ensureFFmpeg();
    const inputExt = selectedFile.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || 'mp4';
    const inputName = `clipbatch_input.${inputExt}`;
    await ffmpeg.writeFile(inputName, new Uint8Array(await selectedFile.arrayBuffer()));
    for (let i = 0; i < count; i++) {
      const clipStart = start + i * segment;
      const clipDuration = Math.min(segment, end - clipStart, sourceDuration - clipStart);
      if (clipDuration <= 0.05) break;
      const outName = `clipbatch_${Date.now()}_${i}.mp4`;
      const clipName = `${base}_clip_${String(firstClipNumber + i).padStart(2, '0')}.mp4`;
      els.progressText.textContent = `Creating clip ${i + 1} of ${count}…`;
      els.progressPercent.textContent = '0%';
      const args = ['-ss', clipStart.toFixed(3), '-i', inputName, '-t', clipDuration.toFixed(3), '-map', '0:v:0', '-map', '0:a?', '-sn', '-dn'];
      if (aspect === '9:16') args.push('-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', outName);
      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) throw new Error(`FFmpeg could not create clip ${i + 1}. Try converting the source to MP4 (H.264) first.`);
      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data], { type: 'video/mp4' });
      const clip = { name: clipName, start: clipStart, end: clipStart + clipDuration, blob, url: URL.createObjectURL(blob) };
      generatedClips.push(clip); newClips.push(clip); addClipCard(clip, generatedClips.length - 1);
      await ffmpeg.deleteFile(outName);
      const overall = Math.round(((i + 1) / count) * 100);
      els.progressBar.style.width = `${overall}%`;
    }
    await ffmpeg.deleteFile(inputName);
    els.progressText.textContent = `Done · ${newClips.length} clips created`;
    els.progressPercent.textContent = '100%';
    els.summary.textContent = `${generatedClips.length} clips ready · ${newClips.length} created in this batch`;
    els.zip.disabled = generatedClips.length === 0;
    if (currentMode === 'batch') {
      nextBatchStart = end; batchNumber++;
      updateBatchPosition();
      if (nextBatchStart + 0.05 < sourceDuration) els.nextBatchWrap.classList.remove('hidden');
      else { els.nextBatchWrap.classList.add('hidden'); setStatus('You have reached the end of this video. All available clips have been generated.'); }
    } else els.nextBatchWrap.classList.add('hidden');
    setStatus(`Success! Created ${newClips.length} clip${newClips.length === 1 ? '' : 's'}. Download them individually or as a ZIP.`);
  } catch (err) {
    console.error(err);
    setStatus(`Could not finish processing: ${err.message || err}. For large files, try a smaller video or a desktop browser with more free memory.`, 'error');
    els.progressText.textContent = 'Processing stopped';
  } finally { isProcessing = false; updateGenerateLabel(); }
}

els.generate.addEventListener('click', () => {
  if (currentMode === 'batch') {
    const start = nextBatchStart;
    const end = Math.min(start + 600, sourceDuration);
    const count = Math.ceil((end - start) / 60);
    if (count < 1) return setStatus('There are no more minutes left in this video.', 'error');
    createClips({ start, end, count, fixedClipSeconds: 60 });
  } else {
    const start = parseTime(els.start.value), end = parseTime(els.end.value), count = Number(els.count.value);
    createClips({ start, end, count });
  }
});
els.nextBatch.addEventListener('click', () => {
  if (currentMode !== 'batch') setMode('batch');
  const start = nextBatchStart, end = Math.min(start + 600, sourceDuration);
  const count = Math.ceil((end - start) / 60);
  if (count > 0) createClips({ start, end, count, fixedClipSeconds: 60 });
});
els.zip.addEventListener('click', async () => {
  if (!generatedClips.length) return;
  els.zip.disabled = true; els.zip.textContent = 'Preparing ZIP…';
  try {
    const zip = new JSZip();
    for (const clip of generatedClips) zip.file(clip.name, clip.blob);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${safeName(selectedFile?.name || 'video')}_clips.zip`;
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (err) { setStatus(`Could not create ZIP: ${err.message}`, 'error'); }
  finally { els.zip.disabled = false; els.zip.textContent = '↓ Download all (.zip)'; }
});

setMode('batch'); updateRangePreview(); updateBatchPosition();
