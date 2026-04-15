(function () {
  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const imageCanvas = document.getElementById('imageCanvas');
  const maskCanvas = document.getElementById('maskCanvas');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const applyBtn = document.getElementById('applyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const brushSizeInput = document.getElementById('brushSize');
  const strengthInput = document.getElementById('strength');
  const analysisBox = document.getElementById('analysisBox');
  const statusBox = document.getElementById('statusBox');
  const toolButtons = document.querySelectorAll('.pill[data-tool]');
  const clearMaskBtn = document.querySelector('.pill[data-action="clear-mask"]');
  const resetBtn = document.querySelector('.pill[data-action="reset"]');

  const imgCtx = imageCanvas.getContext('2d');
  const maskCtx = maskCanvas.getContext('2d');
  let currentImage = new Image();
  let imgLoaded = false;
  let tool = 'brush';
  let drawing = false;
  let startX = 0, startY = 0, lastX = 0, lastY = 0;

  let theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  themeToggle.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
  });

  function setStatus(msg) { statusBox.textContent = msg; }
  function setAnalysis(msg) { analysisBox.textContent = msg; }

  fileInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) loadImageFile(file);
  });

  ['dragenter','dragover'].forEach(name => {
    dropzone.addEventListener(name, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); });
  });
  ['dragleave','drop'].forEach(name => {
    dropzone.addEventListener(name, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', e => {
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadImageFile(file);
  });

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tool = btn.dataset.tool;
      maskCanvas.style.pointerEvents = tool === 'rect' ? 'auto' : 'none';
    });
  });

  clearMaskBtn.addEventListener('click', clearMask);
  resetBtn.addEventListener('click', () => { if (!imgLoaded) return; drawImage(); clearMask(); setStatus('已重置圖片與遮罩'); });

  function loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = evt => {
      const img = new Image();
      img.onload = () => {
        currentImage = img;
        imgLoaded = true;
        fitCanvasToImage();
        drawImage();
        clearMask();
        setStatus('圖片已載入，可先做 Perplexity 分析或直接修補');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  function fitCanvasToImage() {
    const container = document.querySelector('.canvas-container');
    const maxWidth = container.clientWidth;
    const maxHeight = container.clientHeight;
    const ratio = Math.min(maxWidth / currentImage.width, maxHeight / currentImage.height, 1);
    const drawW = Math.round(currentImage.width * ratio);
    const drawH = Math.round(currentImage.height * ratio);
    imageCanvas.width = drawW; imageCanvas.height = drawH;
    maskCanvas.width = drawW; maskCanvas.height = drawH;
    imageCanvas.style.width = drawW + 'px'; imageCanvas.style.height = drawH + 'px';
    maskCanvas.style.width = drawW + 'px'; maskCanvas.style.height = drawH + 'px';
  }

  function drawImage() {
    if (!imgLoaded) return;
    imgCtx.clearRect(0,0,imageCanvas.width,imageCanvas.height);
    imgCtx.drawImage(currentImage,0,0,imageCanvas.width,imageCanvas.height);
  }

  function clearMask() { maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height); }

  function getCanvasPos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const p = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  function drawBrush(x, y, start) {
    const size = parseInt(brushSizeInput.value, 10) || 30;
    maskCtx.fillStyle = 'rgba(255,0,0,0.75)';
    maskCtx.strokeStyle = 'rgba(255,0,0,0.75)';
    maskCtx.lineWidth = size;
    maskCtx.lineCap = 'round';
    if (start) {
      maskCtx.beginPath();
      maskCtx.arc(x, y, size / 2, 0, Math.PI * 2);
      maskCtx.fill();
    } else {
      maskCtx.beginPath();
      maskCtx.moveTo(lastX, lastY);
      maskCtx.lineTo(x, y);
      maskCtx.stroke();
    }
    lastX = x; lastY = y;
  }

  function startDraw(e){ if(!imgLoaded || tool!=='brush') return; drawing=true; const pos=getCanvasPos(imageCanvas,e); lastX=pos.x; lastY=pos.y; drawBrush(pos.x,pos.y,true); }
  function moveDraw(e){ if(!drawing || tool!=='brush') return; const pos=getCanvasPos(imageCanvas,e); drawBrush(pos.x,pos.y,false); }
  function endDraw(){ drawing=false; }
  imageCanvas.addEventListener('mousedown', startDraw);
  imageCanvas.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', endDraw);
  imageCanvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e); }, { passive:false });
  imageCanvas.addEventListener('touchmove', e => { e.preventDefault(); moveDraw(e); }, { passive:false });
  imageCanvas.addEventListener('touchend', endDraw);

  function rectStart(e){ if(!imgLoaded || tool!=='rect') return; drawing=true; const pos=getCanvasPos(maskCanvas,e); startX=pos.x; startY=pos.y; }
  function rectMove(e){
    if(!drawing || tool!=='rect') return;
    const pos=getCanvasPos(maskCanvas,e);
    const x=Math.min(startX,pos.x), y=Math.min(startY,pos.y), w=Math.abs(startX-pos.x), h=Math.abs(startY-pos.y);
    const existing = maskCtx.getImageData(0,0,maskCanvas.width,maskCanvas.height);
    const temp=document.createElement('canvas'); temp.width=maskCanvas.width; temp.height=maskCanvas.height;
    const tctx=temp.getContext('2d'); tctx.putImageData(existing,0,0); tctx.strokeStyle='rgba(255,0,0,0.9)'; tctx.lineWidth=2; tctx.setLineDash([6,4]); tctx.strokeRect(x,y,w,h);
    maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height); maskCtx.drawImage(temp,0,0);
  }
  function rectEnd(e){ if(!drawing || tool!=='rect') return; drawing=false; const pos=getCanvasPos(maskCanvas,e); const x=Math.min(startX,pos.x), y=Math.min(startY,pos.y), w=Math.abs(startX-pos.x), h=Math.abs(startY-pos.y); maskCtx.fillStyle='rgba(255,0,0,0.75)'; maskCtx.setLineDash([]); maskCtx.fillRect(x,y,w,h); }
  maskCanvas.addEventListener('mousedown', rectStart);
  maskCanvas.addEventListener('mousemove', rectMove);
  window.addEventListener('mouseup', rectEnd);
  maskCanvas.addEventListener('touchstart', e => { e.preventDefault(); rectStart(e); }, { passive:false });
  maskCanvas.addEventListener('touchmove', e => { e.preventDefault(); rectMove(e); }, { passive:false });
  maskCanvas.addEventListener('touchend', rectEnd);

  async function analyzeWithPerplexity() {
    if (!imgLoaded) return alert('請先載入圖片');
    setStatus('Perplexity 分析中...');
    setAnalysis('分析中，請稍候...');
    try {
      const res = await fetch('/.netlify/functions/perplexity-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageCanvas.toDataURL('image/png'),
          mask: maskCanvas.toDataURL('image/png'),
          prompt: '請以繁體中文簡短分析這張圖片中被遮罩的區域可能是什麼類型的物件或雜訊，並提供適合內部文件修補的建議。不要鼓勵侵權用途。'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Perplexity 分析失敗');
      setAnalysis(data.text || '沒有回傳分析內容');
      setStatus('Perplexity 分析完成');
    } catch (err) {
      console.error(err);
      setAnalysis('分析失敗：' + err.message);
      setStatus('Perplexity 分析失敗');
    }
  }

  async function applyAiEdit() {
    if (!imgLoaded) return alert('請先載入圖片');
    setStatus('AI 修補中...');
    applyBtn.disabled = true;
    try {
      const res = await fetch('/.netlify/functions/image-edit-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageCanvas.toDataURL('image/png'),
          mask: maskCanvas.toDataURL('image/png'),
          strength: parseInt(strengthInput.value, 10) || 60,
          analysis_hint: analysisBox.textContent || ''
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '修補失敗');
      if (!data.image) throw new Error('沒有收到修補後圖片');
      const img = new Image();
      img.onload = () => {
        currentImage = img;
        fitCanvasToImage();
        drawImage();
        clearMask();
        setStatus('AI 修補完成');
      };
      img.src = data.image;
    } catch (err) {
      console.error(err);
      setStatus('AI 修補失敗：' + err.message);
      alert('AI 修補失敗，請檢查 Netlify env 與內部修補 API 設定');
    } finally {
      applyBtn.disabled = false;
    }
  }

  analyzeBtn.addEventListener('click', analyzeWithPerplexity);
  applyBtn.addEventListener('click', applyAiEdit);
  downloadBtn.addEventListener('click', () => {
    if (!imgLoaded) return;
    const link = document.createElement('a');
    link.download = 'cleaned-image.png';
    link.href = imageCanvas.toDataURL('image/png');
    link.click();
  });

  window.addEventListener('resize', () => {
    if (!imgLoaded) return;
    const snapshot = imageCanvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => { currentImage = img; fitCanvasToImage(); drawImage(); };
    img.src = snapshot;
  });
})();
