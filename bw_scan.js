const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const thresholdInput = document.getElementById('threshold');
const contrastInput = document.getElementById('contrast');
const sharpenInput = document.getElementById('sharpen');
const paperSizeInput = document.getElementById('paperSize');
const dpiInput = document.getElementById('dpi');
const buildPdfBtn = document.getElementById('buildPdfBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const gridEl = document.getElementById('grid');
const hintEl = document.getElementById('hint');
const errorBox = document.getElementById('errorBox');

let items = [];
let pdfUrl = null; let zipUrl = null; let jsZipUrl = null;

function logError(message, detail){ const lines=[]; if(message) lines.push(message); if(detail) lines.push(String(detail)); errorBox.textContent = lines.join('\n'); errorBox.style.display = lines.length ? 'block' : 'none'; }

function updateUI(){
    buildPdfBtn.disabled = items.length === 0;
    downloadZipBtn.disabled = items.length === 0;
    hintEl.textContent = items.length ? `${items.length} page(s) ready.` : 'Add files to convert.';
}

function clearBlobUrls(){ if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = null; } if (zipUrl) { URL.revokeObjectURL(zipUrl); zipUrl = null; } }

// Native picker (no external APIs)
dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', ()=>{ dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); const fs=(e.dataTransfer&&e.dataTransfer.files)?Array.from(e.dataTransfer.files):[]; if(fs.length) handleFiles(filterAccept(fs)); });
dropZone.addEventListener('click', (e)=>{ const inFileArea = e.target && (e.target.id==='fileInput' || (e.target.closest && e.target.closest('input[type="file"]'))); if(!inFileArea) fileInput.click(); });
fileInput.addEventListener('click', (e)=>{ e.stopPropagation(); });
fileInput.addEventListener('change', ()=>{ handleFiles(filterAccept(Array.from(fileInput.files||[]))); fileInput.value=''; });

// Paste support: allow Ctrl/Cmd+V for images and PDFs
window.addEventListener('paste', (e) => {
    const dt = e.clipboardData; if (!dt) return;
    const itemsArr = Array.from(dt.items || []);
    const files = itemsArr.map(it => it.getAsFile && it.getAsFile()).filter(f => f && (f.type.startsWith('image/') || f.type === 'image/svg+xml' || f.type === 'application/pdf'));
    if (files.length) { e.preventDefault(); handleFiles(files); }
}, { passive: false });

function filterAccept(files){
    return files.filter(f=>{
        if (!f) return false;
        if (f.type && (f.type.startsWith('image/') || f.type === 'image/svg+xml' || f.type === 'application/pdf')) return true;
        const name = (f.name||'').toLowerCase();
        return /\.(png|jpe?g|gif|svg|webp|bmp|pdf)$/i.test(name);
    });
}

async function pickWithFSAPI(){
    if (!window.showOpenFilePicker) return null;
    try{
        const handles = await window.showOpenFilePicker({ multiple: true, types:[{ description:'Images/PDF', accept:{ 'image/*':['.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp'], 'application/pdf':['.pdf'] } }] });
        return Promise.all(handles.map(h=>h.getFile()));
    }catch(e){ return null; }
}
function openHiddenInput(){ return new Promise(resolve=>{ const onChange=()=>{ fileInput.removeEventListener('change', onChange); const arr=Array.from(fileInput.files||[]); fileInput.value=''; resolve(arr); }; fileInput.addEventListener('change', onChange, { once:true }); fileInput.click(); }); }
async function selectFiles(){ let files = await pickWithFSAPI(); if (!files || !files.length) files = await openHiddenInput(); return filterAccept(files||[]); }

function handleFiles(fileList){
    clearBlobUrls();
    const files = Array.from(fileList);
    processFiles(files);
}

async function processFiles(files){
    logError('');
    for (const f of files){
        if (f.type === 'application/pdf'){
            await addPdf(f);
        } else if (f.type.startsWith('image/') || f.type === 'image/svg+xml'){
            await addImage(f);
        }
    }
    updateUI();
}

function createItemCard(name, canvas){
    const wrap = document.createElement('div');
    wrap.className = 'item';
    wrap.appendChild(canvas);
    const meta = document.createElement('div'); meta.className = 'meta';
    const span = document.createElement('div'); span.className = 'name'; span.textContent = name;
    const actions = document.createElement('div'); actions.className = 'actions';
    const downloadBtn = document.createElement('button'); downloadBtn.textContent = '⬇️ Download'; downloadBtn.className = 'btn-secondary';
    downloadBtn.addEventListener('click', ()=>{ const a=document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = name.replace(/\.[^.]+$/, '') + '-bw.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); });
    actions.appendChild(downloadBtn);
    meta.appendChild(span); meta.appendChild(actions);
    wrap.appendChild(meta);
    gridEl.appendChild(wrap);
}

function toGrayscaleAndThreshold(srcCanvas){
    const c = document.createElement('canvas');
    c.width = srcCanvas.width; c.height = srcCanvas.height;
    const cx = c.getContext('2d');
    cx.drawImage(srcCanvas, 0, 0);
    let img = cx.getImageData(0, 0, c.width, c.height);
    const data = img.data;
    const thr = Math.max(0, Math.min(255, parseInt(thresholdInput.value||'180', 10)));
    const contrastVal = Math.max(-100, Math.min(100, parseInt(contrastInput.value||'0', 10)));
    const contrastFactor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));
    for (let i = 0; i < data.length; i += 4){
        let r = data[i], g = data[i+1], b = data[i+2];
        let gray = 0.299*r + 0.587*g + 0.114*b;
        gray = contrastVal !== 0 ? Math.max(0, Math.min(255, contrastFactor * (gray - 128) + 128)) : gray;
        const v = gray >= thr ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = v; data[i+3] = 255;
    }
    const amount = Math.max(0, Math.min(2, parseFloat(sharpenInput.value||'0')));
    if (amount > 0){
        const copy = new Uint8ClampedArray(data);
        const w = c.width, h = c.height;
        for (let y=1; y<h-1; y++){
            for (let x=1; x<w-1; x++){
                const idx = (y*w + x)*4;
                for (let ch=0; ch<3; ch++){
                    const center = copy[idx+ch];
                    const top = copy[((y-1)*w + x)*4 + ch];
                    const bottom = copy[((y+1)*w + x)*4 + ch];
                    const left = copy[(y*w + (x-1))*4 + ch];
                    const right = copy[(y*w + (x+1))*4 + ch];
                    const sharpened = center * (1 + 4*amount) - amount*(top + bottom + left + right);
                    data[idx+ch] = Math.max(0, Math.min(255, sharpened));
                }
            }
        }
    }
    cx.putImageData(img, 0, 0);
    return c;
}

function scaleImageElementToCanvas(img){
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
}

function readFileAsDataURL(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=e=>resolve(String(e.target.result)); r.onerror=()=>reject(new Error('Read failed: '+file.name)); r.readAsDataURL(file); }); }

function getPaperDimensions(paperSize, imageWidth, imageHeight, dpi) {
    const mmToPt = 2.83465; const inToPt = 72;
    if (paperSize === 'auto') { const widthPt = (imageWidth / dpi) * inToPt; const heightPt = (imageHeight / dpi) * inToPt; return [widthPt, heightPt]; }
    const sizes = { 'a4': [210 * mmToPt, 297 * mmToPt], 'letter': [8.5 * inToPt, 11 * inToPt], 'legal': [8.5 * inToPt, 14 * inToPt], 'a3': [297 * mmToPt, 420 * mmToPt], 'a5': [148 * mmToPt, 210 * mmToPt] };
    return sizes[paperSize] || sizes['a4'];
}

async function addImage(file){
    try{
        const url = await readFileAsDataURL(file);
        const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('Image load failed')); i.src=url; });
        const srcCanvas = scaleImageElementToCanvas(img);
        const bwCanvas = toGrayscaleAndThreshold(srcCanvas);
        items.push({ name: file.name, canvas: bwCanvas });
        createItemCard(file.name, bwCanvas);
    }catch(e){ console.error(e); logError('Failed to process image', e && e.message); }
}

async function addPdf(file){
    try{
        const arrayBuffer = await file.arrayBuffer();
        const pdfjs = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
        if (!pdfjs) throw new Error('PDF.js not available');
        if (pdfjs.GlobalWorkerOptions) { pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const pageCount = pdf.numPages;
        for (let p = 1; p <= pageCount; p++){
            const page = await pdf.getPage(p);
            const baseScale = 2;
            const viewport = page.getViewport({ scale: baseScale });
            const srcCanvas = document.createElement('canvas');
            const ctx = srcCanvas.getContext('2d');
            srcCanvas.width = Math.floor(viewport.width);
            srcCanvas.height = Math.floor(viewport.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            const bwCanvas = toGrayscaleAndThreshold(srcCanvas);
            items.push({ name: `${file.name.replace(/\.[^.]+$/, '')}-page-${p}.png`, canvas: bwCanvas });
            createItemCard(`${file.name} — page ${p}`, bwCanvas);
        }
    }catch(e){ console.error(e); logError('Failed to process PDF', e && e.message); }
}

async function ensureJsZip(){ if (window.JSZip) return; await new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src='vendor/jszip.min.js'; s.onload=resolve; s.onerror=()=>reject(new Error('Script load error')); document.head.appendChild(s); }); if(!window.JSZip) throw new Error('JSZip not available'); }

buildPdfBtn.addEventListener('click', async ()=>{
    try{
        const { PDFDocument } = window.PDFLib;
        const out = await PDFDocument.create();
        const dpi = Math.max(72, Math.min(600, parseInt(dpiInput.value||'200',10)));
        const paperSize = paperSizeInput.value;
        for (const it of items){
            const imgData = it.canvas.toDataURL('image/png');
            const base64 = imgData.split(',')[1];
            const bytes = Uint8Array.from(atob(base64), c=>c.charCodeAt(0));
            const png = await out.embedPng(bytes);
            const [pageWidthPt, pageHeightPt] = getPaperDimensions(paperSize, png.width, png.height, dpi);
            const page = out.addPage([pageWidthPt, pageHeightPt]);
            const imgAspectRatio = png.width / png.height;
            const pageAspectRatio = pageWidthPt / pageHeightPt;
            let drawWidth, drawHeight, drawX, drawY;
            if (imgAspectRatio > pageAspectRatio) { drawWidth = pageWidthPt; drawHeight = pageWidthPt / imgAspectRatio; drawX = 0; drawY = (pageHeightPt - drawHeight) / 2; }
            else { drawHeight = pageHeightPt; drawWidth = pageHeightPt * imgAspectRatio; drawX = (pageWidthPt - drawWidth) / 2; drawY = 0; }
            page.drawImage(png, { x: drawX, y: drawY, width: drawWidth, height: drawHeight });
        }
        const bytes = await out.save();
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const a=document.createElement('a'); a.href=pdfUrl; a.download='bw-scan.pdf'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }catch(e){ console.error(e); logError('Failed to export PDF', e && e.message); }
});

downloadZipBtn.addEventListener('click', async ()=>{
    try{
        await ensureJsZip();
        const zip = new JSZip();
        items.forEach((it, idx)=>{
            const dataUrl = it.canvas.toDataURL('image/png');
            zip.file((it.name||`page-${idx+1}`).replace(/\.[^.]+$/, '') + '-bw.png', dataUrl.split(',')[1], { base64: true });
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        if (zipUrl) URL.revokeObjectURL(zipUrl);
        zipUrl = URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=zipUrl; a.download='bw-scan-images.zip'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }catch(e){ console.error(e); logError('Failed to create ZIP', e && e.message); }
});

[thresholdInput, contrastInput, sharpenInput].forEach(input=>{
    input.addEventListener('change', ()=>{
        gridEl.innerHTML='';
        const originals = items.map(it=>it.canvas);
        items = items.map((it, idx)=>{ const re = toGrayscaleAndThreshold(originals[idx]); return { name: it.name, canvas: re }; });
        items.forEach(it=> createItemCard(it.name, it.canvas));
    });
});

window.addEventListener('pagehide', ()=>{ clearBlobUrls(); if (jsZipUrl) URL.revokeObjectURL(jsZipUrl); });


