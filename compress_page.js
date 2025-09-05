// Extracted from compress.html to satisfy CSP and remove inline scripts
(function(){
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const maxW = document.getElementById('maxW');
    const maxH = document.getElementById('maxH');
    const quality = document.getElementById('quality');
    const formatSel = document.getElementById('format');
    const compressBtn = document.getElementById('compressBtn');
    const downloadZipBtn = document.getElementById('downloadZipBtn');
    const progressEl = document.getElementById('progress');
    const hintEl = document.getElementById('hint');
    const errorBox = document.getElementById('errorBox');
    const previewSection = document.getElementById('previewSection');
    const previewGrid = document.getElementById('previewGrid');

    let jsZipBlobUrl = null; let zipBlobUrl = null; const createdObjectUrls = new Set();
    let selectedFiles = [];
    let previewRows = [];

    function logError(message, detail) { const lines = []; if (message) lines.push(message); if (detail) lines.push(String(detail)); errorBox.textContent = lines.join('\n'); errorBox.style.display = lines.length ? 'block' : 'none'; }

    // Native picker wiring (no external APIs)
    dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', ()=>{ dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); const fs=(e.dataTransfer&&e.dataTransfer.files)?Array.from(e.dataTransfer.files):[]; if(fs.length) handleFiles(fs); });
    dropZone.addEventListener('click', (e)=>{ const inFileArea = e.target && (e.target.id==='fileInput' || (e.target.closest && e.target.closest('input[type="file"]'))); if(!inFileArea) fileInput.click(); });
    fileInput.addEventListener('click', (e)=>{ e.stopPropagation(); });

    function handleFiles(files) { selectedFiles = files; if (zipBlobUrl) { URL.revokeObjectURL(zipBlobUrl); zipBlobUrl = null; } downloadZipBtn.disabled = true; const original = Array.from(files||[]); const images = filterImages(original); const allowedSet = new Set(images); const skipped = original.filter(f => !allowedSet.has(f)); compressBtn.disabled = images.length === 0; hintEl.textContent = images.length ? `${images.length} image(s) ready.` : 'Select images to compress.'; if (skipped.length) { const names = skipped.map(f=>f && f.name ? f.name : 'unknown').join(', '); logError(`Skipped unsupported file(s): ${names}`); } else { logError(''); } renderOriginalPreviews(images); }
    fileInput.addEventListener('change', () => { handleFiles(Array.from(fileInput.files || [])); fileInput.value=''; });

    function filterImages(arr){ return (arr||[]).filter(f=>{ if(!f) return false; const t=(f.type||'').toLowerCase(); if (t==='image/heic' || t==='image/heif') return false; if (t && (t.startsWith('image/')||t==='image/svg+xml')) return true; const n=(f.name||'').toLowerCase(); if (/(\.heic|\.heif)$/i.test(n)) return false; return /(\.png|\.jpe?g|\.gif|\.svg|\.webp|\.bmp)$/i.test(n); }); }
    function formatBytes(bytes){ if(!Number.isFinite(bytes)||bytes<0) return '0 B'; const units=['B','KB','MB','GB']; let i=0; let v=bytes; while(v>=1024&&i<units.length-1){ v/=1024; i++; } return `${v.toFixed(v<10&&i>0?2:1)} ${units[i]}`; }
    function dataUrlToBlob(dataUrl){ const parts=dataUrl.split(','); const mime=(parts[0].match(/data:(.*?);base64/)||[])[1]||'application/octet-stream'; const binary=atob(parts[1]||''); const len=binary.length; const bytes=new Uint8Array(len); for(let i=0;i<len;i++){ bytes[i]=binary.charCodeAt(i); } return new Blob([bytes], { type: mime }); }
    function renderOriginalPreviews(images){ previewGrid.innerHTML=''; previewRows=[]; if(!images||images.length===0){ previewSection.style.display='none'; return; } previewSection.style.display='block'; images.forEach((file, idx)=>{ const row=document.createElement('div'); row.className='preview-row'; const beforeCard=document.createElement('div'); beforeCard.className='preview-card'; const beforeTitle=document.createElement('div'); beforeTitle.className='preview-title'; beforeTitle.textContent='Before'; const beforeImg=document.createElement('img'); beforeImg.className='preview-image'; const beforeBox=document.createElement('div'); beforeBox.className='preview-placeholder'; beforeBox.textContent='⛔'; beforeBox.style.display='none'; const beforeMeta=document.createElement('div'); beforeMeta.className='preview-meta'; const url=URL.createObjectURL(file); createdObjectUrls.add(url); beforeImg.onerror=()=>{ beforeImg.style.display='none'; beforeBox.style.display='flex'; }; beforeImg.src=url; beforeMeta.textContent=`${file.name} • ${formatBytes(file.size)}`; beforeCard.appendChild(beforeTitle); beforeCard.appendChild(beforeBox); beforeCard.appendChild(beforeImg); beforeCard.appendChild(beforeMeta); const afterCard=document.createElement('div'); afterCard.className='preview-card'; const afterTitle=document.createElement('div'); afterTitle.className='preview-title'; afterTitle.textContent='After'; const afterBox=document.createElement('div'); afterBox.className='preview-placeholder'; afterBox.textContent='🗜️'; const afterImg=document.createElement('img'); afterImg.className='preview-image'; afterImg.style.display='none'; afterImg.alt='Compressed preview'; const afterMeta=document.createElement('div'); afterMeta.className='preview-meta'; afterMeta.textContent='Pending compression…'; afterCard.appendChild(afterTitle); afterCard.appendChild(afterBox); afterCard.appendChild(afterImg); afterCard.appendChild(afterMeta); row.appendChild(beforeCard); row.appendChild(afterCard); previewGrid.appendChild(row); previewRows[idx]={ afterImgEl: afterImg, afterMetaEl: afterMeta, afterBoxEl: afterBox }; }); }
    window.addEventListener('paste', (e) => { const items = e.clipboardData && e.clipboardData.items ? Array.from(e.clipboardData.items) : []; const files = items.map(it => it.getAsFile && it.getAsFile()).filter(f => f && f.type && f.type.startsWith('image/')); if (files.length) { e.preventDefault(); handleFiles(files); } });

    function parseSvgSize(svgText) { try { const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml'); const svg = doc.documentElement; let widthAttr = svg.getAttribute('width'); let heightAttr = svg.getAttribute('height'); let width = 0, height = 0; const parseLen = (v) => { if (!v) return 0; const m = String(v).trim().match(/([\d.]+)/); return m ? Math.max(0, Math.round(parseFloat(m[1]))) : 0; }; width = parseLen(widthAttr); height = parseLen(heightAttr); if ((!width || !height) && svg.hasAttribute('viewBox')) { const vb = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number); if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { width = width || Math.round(vb[2]); height = height || Math.round(vb[3]); } } if (!width || !height) { width = width || 512; height = height || 512; } svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height)); return { width, height, serialized: new XMLSerializer().serializeToString(svg) }; } catch (e) { return { width: 512, height: 512, serialized: svgText }; } }
    function loadImageFromFile(file) { return new Promise((resolve, reject) => { if (file.type === 'image/svg+xml') { const reader = new FileReader(); reader.onerror = () => reject(new Error(`Failed to read SVG: ${file.name}`)); reader.onload = e => { const { serialized } = parseSvgSize(String(e.target.result)); const blob = new Blob([serialized], { type: 'image/svg+xml' }); const url = URL.createObjectURL(blob); createdObjectUrls.add(url); const img = new Image(); img.onload = () => resolve(img); img.onerror = () => { URL.revokeObjectURL(url); createdObjectUrls.delete(url); reject(new Error(`Failed to load SVG image: ${file.name}`)); }; img.src = url; }; reader.readAsText(file); return; } const reader = new FileReader(); reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`)); reader.onload = e => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`)); img.src = e.target.result; }; reader.readAsDataURL(file); }); }
    function scaleToFit(img, maxWidth, maxHeight) { const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1); return { w: Math.round(img.width * scale), h: Math.round(img.height * scale) }; }
    async function ensureJsZip() { if (window.JSZip) return; await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'vendor/jszip.min.js'; s.onload = resolve; s.onerror = () => reject(new Error('Script load error for JSZip')); document.head.appendChild(s); }); if (!window.JSZip) throw new Error('JSZip not available after loading'); }
    async function ensurePako(){ if (window.pako && typeof window.pako.deflate === 'function') return; await new Promise((resolve, reject)=>{ const s=document.createElement('script'); s.src='vendor/pako.min.js'; s.onload=resolve; s.onerror=()=>reject(new Error('Script load error for pako')); document.head.appendChild(s); }); if (!(window.pako && typeof window.pako.deflate === 'function')) throw new Error('pako not available after loading'); }
    async function ensureUPNG(){ if (window.UPNG) return; await ensurePako(); await new Promise((resolve, reject)=>{ const s=document.createElement('script'); s.src='vendor/UPNG.js'; s.onload=resolve; s.onerror=()=>reject(new Error('Script load error for UPNG')); document.head.appendChild(s); }); if (!window.UPNG) throw new Error('UPNG not available after loading'); }

    compressBtn.addEventListener('click', async () => { 
        const files = (selectedFiles || []).filter(f => f && (f.type.startsWith('image/') || f.type === 'image/svg+xml'));
        if (files.length === 0) return; 
        compressBtn.disabled = true; 
        downloadZipBtn.disabled = true; 
        progressEl.style.display = 'block'; 
        progressEl.value = 0; 
        progressEl.max = files.length; 
        logError(''); 
        try { 
            await ensureJsZip(); 
            const images = await Promise.all(files.map(loadImageFromFile)); 
            const zip = new JSZip(); 
            const maxWVal = parseInt(maxW.value, 10); const maxHVal = parseInt(maxH.value, 10);
            const mw = Number.isFinite(maxWVal) && maxWVal > 0 ? maxWVal : Infinity;
            const mh = Number.isFinite(maxHVal) && maxHVal > 0 ? maxHVal : Infinity;
            for (let i = 0; i < images.length; i++) { 
                const img = images[i]; 
                const target = scaleToFit(img, mw, mh); 
                const canvas = document.createElement('canvas'); 
                canvas.width = target.w; 
                canvas.height = target.h; 
                const ctx = canvas.getContext('2d'); 
                ctx.drawImage(img, 0, 0, target.w, target.h); 
                let mime = formatSel.value; if (!mime) { const ot=(files[i].type||'').toLowerCase(); mime = (ot==='image/png'||ot==='image/svg+xml') ? 'image/png' : (ot==='image/webp' ? 'image/webp' : 'image/jpeg'); }
                const baseName = (files[i].name || `image_${i+1}`).replace(/\.[^.]+$/, ''); 
                let outBlob; let ext;
                if (mime === 'image/png') {
                    await ensureUPNG();
                    const imageData = ctx.getImageData(0, 0, target.w, target.h);
                    const ab = UPNG.encode([imageData.data.buffer], target.w, target.h, 256);
                    outBlob = new Blob([ab], { type: 'image/png' });
                    ext = 'png';
                } else {
                    const q = Math.min(1, Math.max(0.1, parseFloat(quality.value || '0.3')));
                    const dataUrl = canvas.toDataURL(mime, q);
                    outBlob = dataUrlToBlob(dataUrl);
                    ext = mime === 'image/jpeg' ? 'jpg' : (mime === 'image/webp' ? 'webp' : 'png');
                }
                zip.file(`${baseName}-compressed.${ext}`, outBlob);
                const outUrl = URL.createObjectURL(outBlob); 
                createdObjectUrls.add(outUrl); 
                const row = previewRows[i]; 
                if (row) { 
                    row.afterBoxEl.style.display = 'none'; 
                    row.afterImgEl.style.display = 'block'; 
                    row.afterImgEl.src = outUrl; 
                    row.afterMetaEl.textContent = `${baseName}-compressed.${ext} • ${formatBytes(outBlob.size)}`; 
                }
                progressEl.value = i + 1; 
            } 
            const blob = await zip.generateAsync({ type: 'blob' }); 
            if (zipBlobUrl) URL.revokeObjectURL(zipBlobUrl); 
            zipBlobUrl = URL.createObjectURL(blob); 
            downloadZipBtn.disabled = false; 
            compressBtn.disabled = false; 
            progressEl.style.display = 'none'; 
            hintEl.textContent = 'Compression complete. Download ZIP.'; 
        } catch (e) { 
            console.error(e); 
            logError('Compression failed', e && e.message); 
            progressEl.style.display = 'none'; 
            compressBtn.disabled = false; 
        } 
    });

    downloadZipBtn.addEventListener('click', () => { if (!zipBlobUrl) return; const a = document.createElement('a'); a.href = zipBlobUrl; a.download = 'compressed_images.zip'; document.body.appendChild(a); a.click(); document.body.removeChild(a); });

    window.addEventListener('pagehide', () => { if (zipBlobUrl) URL.revokeObjectURL(zipBlobUrl); if (jsZipBlobUrl) URL.revokeObjectURL(jsZipBlobUrl); createdObjectUrls.forEach(u => URL.revokeObjectURL(u)); createdObjectUrls.clear(); });
})();


