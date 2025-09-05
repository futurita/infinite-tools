const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const paperSizeSel = document.getElementById('paperSize');
const orientationSel = document.getElementById('orientation');
const marginsMmInput = document.getElementById('marginsMm');
const fitModeSel = document.getElementById('fitMode');
const buildBtn = document.getElementById('buildBtn');
const downloadBtn = document.getElementById('downloadBtn');
const listEl = document.getElementById('list');
const hintEl = document.getElementById('hint');
const errorBox = document.getElementById('errorBox');

let items = [];
let pdfUrl = null;

const PAPER_MM = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 }, Letter: { w: 215.9, h: 279.4 }, Legal: { w: 215.9, h: 355.6 } };
function logError(message, detail){ const lines=[]; if(message) lines.push(message); if(detail) lines.push(String(detail)); errorBox.textContent = lines.join('\n'); errorBox.style.display = lines.length ? 'block' : 'none'; }
function mmToPt(mm){ return (mm / 25.4) * 72; }

function updateUI(){ buildBtn.disabled = items.length === 0; downloadBtn.disabled = !pdfUrl; hintEl.textContent = items.length ? `${items.length} image(s) ready.` : 'Add images to merge.'; renderList(); }
function revokePdf(){ if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = null; } }

function renderList(){
  listEl.innerHTML = '';
  items.forEach((it, idx) => {
    const itemDiv = document.createElement('div'); itemDiv.className = 'item';
    const img = document.createElement('img'); img.className = 'thumb'; img.src = it.url; img.alt = 'thumb';
    const infoWrap = document.createElement('div');
    const nameDiv = document.createElement('div'); nameDiv.textContent = it.file.name || '';
    const metaDiv = document.createElement('div'); metaDiv.className = 'meta'; const sizeKb = Math.round((it.file.size||0)/1024); metaDiv.textContent = (it.file.type || 'image') + ' — ' + sizeKb + ' KB';
    infoWrap.appendChild(nameDiv); infoWrap.appendChild(metaDiv);
    const moveWrap = document.createElement('div'); moveWrap.className = 'move';
    const upBtn = document.createElement('button'); upBtn.textContent = '↑';
    const downBtn = document.createElement('button'); downBtn.textContent = '↓';
    const removeBtn = document.createElement('button'); removeBtn.textContent = '✕';
    moveWrap.appendChild(upBtn); moveWrap.appendChild(downBtn); moveWrap.appendChild(removeBtn);
    upBtn.addEventListener('click', ()=>{ if (idx>0){ const t=items[idx-1]; items[idx-1]=items[idx]; items[idx]=t; revokePdf(); updateUI(); } });
    downBtn.addEventListener('click', ()=>{ if (idx<items.length-1){ const t=items[idx+1]; items[idx+1]=items[idx]; items[idx]=t; revokePdf(); updateUI(); } });
    removeBtn.addEventListener('click', ()=>{ items.splice(idx,1); revokePdf(); updateUI(); });
    itemDiv.appendChild(img); itemDiv.appendChild(infoWrap); itemDiv.appendChild(moveWrap); listEl.appendChild(itemDiv);
  });
}

function filterImages(files){ return (files||[]).filter(f=>{ if(!f) return false; if (f.type && (f.type.startsWith('image/') || f.type==='image/svg+xml')) return true; const n=(f.name||'').toLowerCase(); return /(png|jpe?g|gif|svg|webp|bmp)$/i.test(n); }); }

function addFiles(files){ revokePdf(); const arr = filterImages(Array.from(files || [])); arr.forEach(f => { const url = URL.createObjectURL(f); items.push({ file: f, url }); }); updateUI(); }

fileInput.addEventListener('change', ()=>{ if(fileInput.files && fileInput.files.length){ addFiles(filterImages(Array.from(fileInput.files))); fileInput.value=''; } });
dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', ()=>{ dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); const fs=(e.dataTransfer&&e.dataTransfer.files)?Array.from(e.dataTransfer.files):[]; if(fs.length) addFiles(filterImages(fs)); });
dropZone.addEventListener('click', (e)=>{ const inFileArea = e.target && (e.target.id==='fileInput' || (e.target.closest && e.target.closest('input[type="file"]'))); if(!inFileArea) fileInput.click(); });
fileInput.addEventListener('click', (e)=>{ e.stopPropagation(); });

window.addEventListener('paste', (e) => { const dt = e.clipboardData; if (!dt) return; const items = Array.from(dt.items || []); const files = items.map(it => it.getAsFile && it.getAsFile()).filter(f => f && (f.type.startsWith('image/') || f.type === 'image/svg+xml')); if (files.length) { e.preventDefault(); addFiles(files); } }, { passive: false });

function loadImageFromItem(it){ return new Promise((resolve, reject)=>{ if (it.file.type === 'image/svg+xml'){ const reader = new FileReader(); reader.onload = e => { const img = new Image(); img.onload = ()=> resolve(img); img.onerror = ()=> reject(new Error('SVG load error')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(e.target.result)); }; reader.onerror = ()=> reject(new Error('SVG read error')); reader.readAsText(it.file); return; } const img = new Image(); img.onload = ()=> resolve(img); img.onerror = ()=> reject(new Error('Image load error')); img.src = it.url; }); }

function getPageSizePt(){ const paper = PAPER_MM[paperSizeSel.value] || PAPER_MM.A4; const portrait = orientationSel.value === 'portrait'; const wmm = portrait ? paper.w : paper.h; const hmm = portrait ? paper.h : paper.w; return { w: mmToPt(wmm), h: mmToPt(hmm) }; }

async function buildPdf(){
  try{
    logError('');
    const { PDFDocument } = window.PDFLib;
    const pdf = await PDFDocument.create();
    const margin = Math.max(0, Number(marginsMmInput.value||0));
    const marginPt = mmToPt(margin);
    const fitMode = fitModeSel.value;
    for (const it of items){
      const imgEl = await loadImageFromItem(it);
      const pageSize = getPageSizePt();
      const page = pdf.addPage([pageSize.w, pageSize.h]);
      const targetW = Math.max(1, pageSize.w - 2*marginPt);
      const targetH = Math.max(1, pageSize.h - 2*marginPt);
      const c = document.createElement('canvas'); c.width = imgEl.naturalWidth || imgEl.width; c.height = imgEl.naturalHeight || imgEl.height; const cx = c.getContext('2d'); cx.drawImage(imgEl, 0, 0);
      const isPng = (it.file.type||'').includes('png') || (!it.file.type && it.file.name.toLowerCase().endsWith('.png'));
      const dataUrl = c.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.92);
      const base64 = dataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const sW = img.width; const sH = img.height;
      const scaleContain = Math.min(targetW/sW, targetH/sH);
      const scaleCover = Math.max(targetW/sW, targetH/sH);
      const scale = fitMode === 'cover' ? scaleCover : scaleContain;
      const drawW = sW * scale; const drawH = sH * scale;
      const x = (pageSize.w - drawW) / 2; const y = (pageSize.h - drawH) / 2;
      page.drawImage(img, { x, y, width: drawW, height: drawH });
    }
    const bytes = await pdf.save();
    revokePdf();
    pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    downloadBtn.disabled = false;
  } catch(e){ console.error(e); logError('Failed to build PDF', e && e.message); downloadBtn.disabled = true; }
}

function downloadPdf(){ if (!pdfUrl) return; const a=document.createElement('a'); a.href=pdfUrl; a.download='merged.pdf'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

buildBtn.addEventListener('click', buildPdf);
downloadBtn.addEventListener('click', downloadPdf);
[paperSizeSel, orientationSel, marginsMmInput, fitModeSel].forEach(el=> el.addEventListener('change', ()=> revokePdf() ));

updateUI();


