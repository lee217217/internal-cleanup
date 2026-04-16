const state = {
  sourceImage: null,
  sourceImageUrl: '',
  analysisText: '',
  generatedPrompt: '',
  cleanedImageUrl: '',
  maskStrokes: [],
  isDrawing: false,
  brushSize: 28,
  theme: 'light'
};

const fileInput = document.getElementById('fileInput');
const imageName = document.getElementById('imageName');
const imageMeta = document.getElementById('imageMeta');
const promptInput = document.getElementById('promptInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const cleanupBtn = document.getElementById('cleanupBtn');
const resetMaskBtn = document.getElementById('resetMaskBtn');
const downloadBtn = document.getElementById('downloadBtn');
const actionStatus = document.getElementById('actionStatus');
const analysisOut = document.getElementById('analysisOut');
const promptOut = document.getElementById('promptOut');
const resultImg = document.getElementById('resultImg');
const sourceImg = document.getElementById('sourceImg');
const canvas = document.getElementById('maskCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');
const dropzone = document.getElementById('dropzone');
const brushSizeInput = document.getElementById('brushSize');
const brushSizeLabel = document.getElementById('brushSizeLabel');

function setStatus(message, tone = 'muted') {
  if (!actionStatus) return;
  actionStatus.textContent = message;
  actionStatus.dataset.tone = tone;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setTheme(nextTheme) {
  state.theme = nextTheme;
  document.documentElement.setAttribute('data-theme', nextTheme);
  if (themeIcon) themeIcon.textContent = nextTheme === 'dark' ? '☀️' : '🌙';
  if (themeText) themeText.textContent = nextTheme === 'dark' ? 'Light' : 'Dark';
}

function toggleTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function updateButtons() {
  const hasImage = !!state.sourceImage;
  if (analyzeBtn) analyzeBtn.disabled = !hasImage;
  if (cleanupBtn) cleanupBtn.disabled = !hasImage;
  if (resetMaskBtn) resetMaskBtn.disabled = !hasImage || !state.maskStrokes.length;
  if (downloadBtn) downloadBtn.disabled = !state.cleanedImageUrl;
}

function updatePromptSuggestion() {
  if (!promptOut) return;
  const hasMask = state.maskStrokes.length > 0;
  const userPrompt = (promptInput?.value || '').trim();
  const basePrompt = userPrompt || '保留原圖主體、構圖、光線與色調，只修補遮罩區域，讓背景自然銜接，不要重畫整張圖。';
  const finalPrompt = hasMask
    ? `請以我上傳的圖片為基礎生成修正版，僅修補我已標記的遮罩區域。${basePrompt}`
    : `請以我上傳的圖片為基礎生成修正版。${basePrompt}`;
  state.generatedPrompt = finalPrompt;
  promptOut.innerHTML = `<div class="report-block"><h3>建議編輯指令</h3><p>${escapeHtml(finalPrompt)}</p></div>`;
}

function setAnalysis(html) {
  if (analysisOut) analysisOut.innerHTML = html;
}

function resetCanvas() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,0,80,0.82)';
  ctx.fillStyle = 'rgba(255,0,80,0.22)';
}

function resizeCanvasToImage() {
  if (!canvas || !sourceImg) return;
  const rect = sourceImg.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  resetCanvas();
  redrawMask();
}

function redrawMask() {
  if (!ctx || !canvas) return;
  resetCanvas();
  state.maskStrokes.forEach(stroke => {
    if (!stroke.points.length) return;
    ctx.beginPath();
    ctx.lineWidth = stroke.size;
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  });
  updateButtons();
  updatePromptSuggestion();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event;
  return {
    x: ((source.clientX - rect.left) / rect.width) * canvas.width,
    y: ((source.clientY - rect.top) / rect.height) * canvas.height
  };
}

function beginStroke(event) {
  if (!state.sourceImage || !canvas) return;
  event.preventDefault();
  state.isDrawing = true;
  const point = getCanvasPoint(event);
  state.maskStrokes.push({ size: Number(state.brushSize || 28), points: [point] });
  redrawMask();
  setStatus('已標記遮罩區域。你可以繼續塗抹，然後按「產生修補建議」。');
}

function moveStroke(event) {
  if (!state.isDrawing || !state.maskStrokes.length) return;
  event.preventDefault();
  state.maskStrokes[state.maskStrokes.length - 1].points.push(getCanvasPoint(event));
  redrawMask();
}

function endStroke() {
  state.isDrawing = false;
  updateButtons();
}

function clearMask() {
  state.maskStrokes = [];
  redrawMask();
  setStatus('遮罩已清除。你可以重新框選要修補的位置。');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('讀取圖片失敗'));
    reader.readAsDataURL(file);
  });
}

async function loadImageFile(file) {
  if (!file) return;
  state.sourceImage = file;
  state.cleanedImageUrl = '';
  state.maskStrokes = [];
  const url = await readFileAsDataUrl(file);
  state.sourceImageUrl = url;
  if (sourceImg) sourceImg.src = url;
  if (resultImg) resultImg.src = '';
  if (imageName) imageName.textContent = file.name;
  if (imageMeta) imageMeta.textContent = `${Math.round(file.size / 1024)} KB`;
  setAnalysis('<div class="report-block"><h3>等待分析</h3><p>請先按「分析圖片」，確認 Perplexity 對圖片與遮罩區域的理解，再按「產生修補建議」。</p></div>');
  updatePromptSuggestion();
  updateButtons();
  setStatus('圖片已載入。請先畫出遮罩範圍，再按「分析圖片」。', 'ready');
  requestAnimationFrame(() => resizeCanvasToImage());
}

function getMaskBounds() {
  if (!state.maskStrokes.length || !canvas) return null;
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  state.maskStrokes.forEach(stroke => {
    stroke.points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });
  return {
    left: Math.round(minX),
    top: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY)
  };
}

function buildAnalysisPrompt() {
  const userPrompt = (promptInput?.value || '').trim();
  const bounds = getMaskBounds();
  const areaText = bounds
    ? `你正在分析使用者剛上傳的同一張圖片。使用者已標記一個需要修補的區域，約在圖片座標 left=${bounds.left}, top=${bounds.top}, width=${bounds.width}, height=${bounds.height}。`
    : '你正在分析使用者剛上傳的同一張圖片，但使用者尚未提供遮罩區域。';
  return [
    '這不是一般搜尋任務，也不是網頁搜尋摘要。',
    '不要說你無法查看圖片、不能分析圖片、是文字搜尋助手，或根據搜尋結果回答。',
    '你必須直接根據使用者上傳的圖片內容與遮罩區域進行局部修補分析。',
    areaText,
    '請用繁體中文回覆，並嚴格輸出以下三段標題：',
    '1. 需要修補的區域判斷',
    '2. 保留不變的元素',
    '3. 建議的修補指令',
    '第三段必須是一段可直接用於圖片修補的完整指令，內容要明確要求：保留原圖構圖、主體、光線、色調，只修補遮罩區域，避免重畫整張圖。',
    '不要加入法律建議，不要推薦其他平台，不要討論限制。',
    userPrompt ? `補充要求：${userPrompt}` : ''
  ].filter(Boolean).join('\n');
}

async function analyzeImage() {
  if (!state.sourceImageUrl) {
    setStatus('請先上傳圖片。', 'error');
    return;
  }
  setStatus('正在分析圖片與遮罩區域…', 'loading');
  setAnalysis('<div class="report-block"><h3>分析中</h3><p>Perplexity 正在整理修補區域、保留元素與建議編輯指令。</p></div>');
  updatePromptSuggestion();

  try {
    const response = await fetch('/.netlify/functions/perplexity-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: state.sourceImageUrl,
        prompt: buildAnalysisPrompt(),
        mode: 'cleanup-guidance',
        enforce_image_analysis: true
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || '分析失敗');

    const answer = String(data?.result || data?.analysis || data?.content || '').trim();
    const refusalPattern = /無法查看圖片|無法分析圖片|無法處理圖片|文字型搜尋助手|根據搜尋結果|我沒有能力分析|不能查看圖片/i;
    state.analysisText = answer;

    if (refusalPattern.test(answer)) {
      setAnalysis(`<div class="report-block"><h3>分析模式跑偏</h3><p>這次回應沒有真正針對上傳圖片進行局部修補分析，而是退回一般搜尋助手回答。請重試一次；如果仍然出現同樣內容，就需要同步調整 Netlify function 的 system prompt。</p></div><div class="report-block"><h3>原始回應</h3><p>${escapeHtml(answer)}</p></div>`);
      setStatus('分析模式跑偏：模型沒有真正進入圖片修補分析。', 'error');
      return;
    }

    setAnalysis(`<div class="report-block"><h3>Perplexity 分析結果</h3><p>${escapeHtml(answer || '未取得分析結果。')}</p></div>`);

    const promptMatch = answer.match(/建議的修補指令[:：]\s*([\s\S]*)$/);
    if (promptMatch?.[1]) {
      state.generatedPrompt = promptMatch[1].trim();
      if (promptOut) promptOut.innerHTML = `<div class="report-block"><h3>建議編輯指令</h3><p>${escapeHtml(state.generatedPrompt)}</p></div>`;
    }

    setStatus('分析完成。請確認建議編輯指令後，再按「產生修補建議」。', 'success');
  } catch (error) {
    setAnalysis(`<div class="report-block"><h3>分析失敗</h3><p>${escapeHtml(error.message || '未知錯誤')}</p></div>`);
    setStatus(`分析失敗：${error.message || '未知錯誤'}`, 'error');
  }
}

function applyLocalCleanupPreview() {
  if (!state.sourceImageUrl || !canvas || !state.maskStrokes.length) return '';
  const base = document.createElement('canvas');
  const baseCtx = base.getContext('2d');
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => {
      base.width = img.width;
      base.height = img.height;
      baseCtx.drawImage(img, 0, 0, base.width, base.height);
      const scaleX = base.width / canvas.width;
      const scaleY = base.height / canvas.height;
      baseCtx.save();
      baseCtx.filter = 'blur(18px) saturate(0.98)';
      state.maskStrokes.forEach(stroke => {
        baseCtx.beginPath();
        baseCtx.lineJoin = 'round';
        baseCtx.lineCap = 'round';
        baseCtx.lineWidth = stroke.size * ((scaleX + scaleY) / 2);
        const first = stroke.points[0];
        baseCtx.moveTo(first.x * scaleX, first.y * scaleY);
        stroke.points.slice(1).forEach(p => baseCtx.lineTo(p.x * scaleX, p.y * scaleY));
        baseCtx.stroke();
      });
      baseCtx.restore();
      resolve(base.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('建立修補預覽失敗'));
    img.src = state.sourceImageUrl;
  });
}

async function createCleanupSuggestion() {
  if (!state.sourceImageUrl) {
    setStatus('請先上傳圖片。', 'error');
    return;
  }
  if (!state.maskStrokes.length) {
    setStatus('請先在圖片上畫出要修補的區域。', 'error');
    return;
  }

  setStatus('正在建立修補建議與預覽…', 'loading');
  const effectivePrompt = state.generatedPrompt || buildAnalysisPrompt();

  try {
    const preview = await applyLocalCleanupPreview();
    state.cleanedImageUrl = preview;
    if (resultImg) resultImg.src = preview;
    updateButtons();

    const summaryHtml = `
      <div class="report-block">
        <h3>修補建議已建立</h3>
        <p>目前結果為前端本地預覽版，目的是讓你快速確認遮罩範圍與修補方向是否合理。</p>
      </div>
      <div class="report-block">
        <h3>建議下一步</h3>
        <p>${escapeHtml(effectivePrompt)}</p>
      </div>
    `;
    setAnalysis(summaryHtml);
    setStatus('已產生修補建議。你可以下載預覽圖，或調整遮罩後重新執行。', 'success');
  } catch (error) {
    setStatus(`建立修補建議失敗：${error.message || '未知錯誤'}`, 'error');
  }
}

function downloadResult() {
  if (!state.cleanedImageUrl) return;
  const a = document.createElement('a');
  a.href = state.cleanedImageUrl;
  a.download = 'cleanup-preview.png';
  a.click();
}

function bindDropzone() {
  if (!dropzone || !fileInput) return;
  ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  }));
  dropzone.addEventListener('drop', e => {
    const file = e.dataTransfer?.files?.[0];
    if (file) loadImageFile(file);
  });
}

fileInput?.addEventListener('change', e => loadImageFile(e.target.files?.[0]));
analyzeBtn?.addEventListener('click', analyzeImage);
cleanupBtn?.addEventListener('click', createCleanupSuggestion);
resetMaskBtn?.addEventListener('click', clearMask);
downloadBtn?.addEventListener('click', downloadResult);
themeToggle?.addEventListener('click', toggleTheme);
brushSizeInput?.addEventListener('input', e => {
  state.brushSize = Number(e.target.value || 28);
  if (brushSizeLabel) brushSizeLabel.textContent = `${state.brushSize}px`;
});
window.addEventListener('resize', resizeCanvasToImage);
sourceImg?.addEventListener('load', resizeCanvasToImage);

canvas?.addEventListener('mousedown', beginStroke);
canvas?.addEventListener('mousemove', moveStroke);
window.addEventListener('mouseup', endStroke);
canvas?.addEventListener('touchstart', beginStroke, { passive: false });
canvas?.addEventListener('touchmove', moveStroke, { passive: false });
window.addEventListener('touchend', endStroke);

bindDropzone();
setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
updatePromptSuggestion();
updateButtons();
setStatus('上傳圖片後，先框選要修補的位置，再按「分析圖片」。');

console.log('app.js version 2026-04-16-1206 cleanup-prompt-tightened');
