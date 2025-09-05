(function(){
    const input = document.getElementById('fileInput');
    const drop = document.getElementById('dropzone');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const penSize = document.getElementById('penSize');
    const cursorEl = document.getElementById('cursor');
    const downloadBtn = document.getElementById('download');
    const addTextBtn = document.getElementById('addText');
    const textModeBtn = document.getElementById('textMode');
    const textSizeInput = document.getElementById('textSize');
    const textColorInput = document.getElementById('textColor');
    const textFontSelect = document.getElementById('textFont');
    const textStyleSelect = document.getElementById('textStyle');
    const clearBtn = document.getElementById('clear');
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');

    let pdfDoc = null;
    let pdfjsDoc = null;
    let currentPageIndex = 0;
    let pageViewport = null;
    let isDrawing = false;
    const BLUE = '#0A66FF';
    let originalPdfBytes = null; // ArrayBuffer of the original PDF for stateless exports

    // Per-page data stores
    const strokesByPage = {}; // { [pageIndex]: [ path{size:number, points:[{x,y},...] } ] }
    const redoByPage = {}; // { [pageIndex]: [ path ... ] }
    const annotationsByPage = {}; // { [pageIndex]: [ { id, xCss, yCss, text, fontSize, color, font, style, locked } ] }
    const textDefaults = { fontSize: 14, color: '#111111', font: 'Helvetica', style: 'Normal' };
    let isTextMode = false;

    function pageArray(obj, idx){ if(!obj[idx]) obj[idx] = []; return obj[idx]; }
    function getStrokes(idx){ return pageArray(strokesByPage, idx); }
    function getRedo(idx){ return pageArray(redoByPage, idx); }
    function getAnnotations(idx){ return pageArray(annotationsByPage, idx); }

    function resizeCanvasToPage(width, height) {
        canvas.width = width;
        canvas.height = height;
    }

    async function renderPageToCanvas(pageNumber) {
        const page = await pdfjsDoc.getPage(pageNumber);
        pageViewport = page.getViewport({ scale: 1 });
        resizeCanvasToPage(pageViewport.width, pageViewport.height);
        // Clear to ensure prior strokes are removed before PDF render
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: pageViewport }).promise;
        redrawStrokes();
        syncOverlayFromModel();
    }

    async function loadPdf(arrayBuffer) {
        const { PDFDocument } = window.PDFLib;
        pdfDoc = await PDFDocument.load(arrayBuffer);
        // Keep a detached copy to avoid any mutation/detach issues
        originalPdfBytes = arrayBuffer.slice(0);
        const pdfjs = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
        if (!pdfjs) throw new Error('PDF.js not available');
        // Disable PDF.js worker to satisfy strict CSP and file:// usage
        pdfjs.disableWorker = true;
        pdfjsDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        // Reset state
        Object.keys(strokesByPage).forEach(k=> delete strokesByPage[k]);
        Object.keys(redoByPage).forEach(k=> delete redoByPage[k]);
        Object.keys(annotationsByPage).forEach(k=> delete annotationsByPage[k]);
        currentPageIndex = 0;
        await renderPageToCanvas(1);
    }

    function redrawStrokes() {
        ctx.strokeStyle = BLUE;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const paths = getStrokes(currentPageIndex);
        paths.forEach(path => {
            if (!path || !path.points || path.points.length < 2) return;
            ctx.beginPath();
            ctx.lineWidth = path.size;
            ctx.moveTo(path.points[0].x, path.points[0].y);
            for (let i=1;i<path.points.length;i++) ctx.lineTo(path.points[i].x, path.points[i].y);
            ctx.stroke();
        });
    }

    async function refreshView() {
        if (pdfjsDoc) {
            await renderPageToCanvas(currentPageIndex + 1);
        } else {
            ctx.clearRect(0,0,canvas.width,canvas.height);
            redrawStrokes();
            syncOverlayFromModel();
        }
    }

    function getCanvasScale(){
        const rect = canvas.getBoundingClientRect();
        const sx = (rect.width && canvas.width) ? (canvas.width / rect.width) : 1;
        const sy = (rect.height && canvas.height) ? (canvas.height / rect.height) : 1;
        return { sx: (Number.isFinite(sx) && sx>0 ? sx : 1), sy: (Number.isFinite(sy) && sy>0 ? sy : 1), rect };
    }

    function startDraw(x,y) {
        if (isTextMode) { return; }
        isDrawing = true;
        const sizeCss = Math.max(1, parseInt(penSize.value,10));
        const { sx } = getCanvasScale();
        const sizeCanvas = Math.max(1, Math.round(sizeCss * sx));
        const paths = getStrokes(currentPageIndex);
        paths.push({ size: sizeCanvas, points: [{x,y}] });
        // new drawing invalidates redo
        redoByPage[currentPageIndex] = [];
        cursorEl.classList.add('pulse');
    }
    function moveDraw(x,y) {
        if (!isDrawing) return;
        const paths = getStrokes(currentPageIndex);
        const last = paths[paths.length-1];
        if (!last) return;
        last.points.push({x,y});
        redrawStrokes();
    }
    function endDraw() { isDrawing = false; cursorEl.classList.remove('pulse'); }

    function updateCursorStyle(){
        const dCss = 16;
        cursorEl.style.width = dCss + 'px';
        cursorEl.style.height = dCss + 'px';
        cursorEl.style.display = 'block';
    }

    function positionCursorFromEvent(e){
        const rect = canvas.getBoundingClientRect();
        const clientX = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
        const clientY = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        cursorEl.style.left = x + 'px';
        cursorEl.style.top = y + 'px';
    }

    // Cursor follow and size sync
    updateCursorStyle();
    penSize.addEventListener('input', ()=> {/* cursor independent now */});
    canvas.addEventListener('mousemove', (e)=>{ positionCursorFromEvent(e); cursorEl.style.display='block'; });
    canvas.addEventListener('mouseleave', ()=>{ cursorEl.style.display='none'; });
    canvas.addEventListener('mouseenter', ()=>{ updateCursorStyle(penSize.value); cursorEl.style.display='block'; });
    canvas.addEventListener('touchstart', (e)=>{ positionCursorFromEvent(e); cursorEl.style.display='block'; }, { passive:true });
    canvas.addEventListener('touchmove', (e)=>{ positionCursorFromEvent(e); }, { passive:true });
    window.addEventListener('touchend', ()=>{ cursorEl.style.display='none'; });

    function coordsFromEvent(e){
        const { rect, sx, sy } = getCanvasScale();
        const clientX = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
        const clientY = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
        const xCss = clientX - rect.left;
        const yCss = clientY - rect.top;
        return { x: xCss * sx, y: yCss * sy, xCss, yCss };
    }

    canvas.addEventListener('mousedown', e => { const p = coordsFromEvent(e); if (isTextMode) { insertTextAtCss(p.xCss, p.yCss); } else { startDraw(p.x, p.y); } positionCursorFromEvent(e); });
    canvas.addEventListener('mousemove', e => { const p = coordsFromEvent(e); if (isDrawing) moveDraw(p.x, p.y); positionCursorFromEvent(e); });
    window.addEventListener('mouseup', endDraw);
    canvas.addEventListener('touchstart', e => { const p = coordsFromEvent(e); startDraw(p.x, p.y); positionCursorFromEvent(e); e.preventDefault(); }, { passive:false });
    canvas.addEventListener('touchmove', e => { const p = coordsFromEvent(e); if (isDrawing) moveDraw(p.x, p.y); positionCursorFromEvent(e); e.preventDefault(); }, { passive:false });
    window.addEventListener('touchend', endDraw);

    // Text annotations: model + overlay DOM
    function syncOverlayFromModel(){
        const wrap = document.querySelector('.canvaswrap');
        // remove existing overlay boxes
        Array.from(wrap.querySelectorAll('.text-box')).forEach(el=> el.remove());
        // add current page annotations
        getAnnotations(currentPageIndex).forEach(ann=> renderAnnotationEl(ann));
    }

    function getCleanTextFromBox(tb){
        // Clone and strip control elements to avoid exporting their symbols (e.g., ×, ✓)
        const clone = tb.cloneNode(true);
        Array.from(clone.querySelectorAll('.handle, .remove, .confirm')).forEach(el => el.remove());
        return (clone.innerText || '').replace(/\s+$/,'');
    }

    function renderAnnotationEl(ann){
        const wrap = document.querySelector('.canvaswrap');
        const tb = document.createElement('div');
        tb.className = 'text-box unconfirmed';
        tb.contentEditable = 'true';
        tb.style.left = (ann.xCss || 20) + 'px';
        tb.style.top = (ann.yCss || 20) + 'px';
        tb.style.whiteSpace = 'pre-wrap';
        tb.style.fontSize = (ann.fontSize || textDefaults.fontSize) + 'px';
        tb.style.color = ann.color || textDefaults.color;
        tb.innerText = ann.text || 'Type here';
        tb.dataset.id = ann.id;
        const handle = document.createElement('div');
        handle.className = 'handle';
        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.setAttribute('aria-label','Remove text box');
        remove.textContent = '×';
        const confirm = document.createElement('button');
        confirm.className = 'confirm';
        confirm.type = 'button';
        confirm.setAttribute('aria-label','Confirm text');
        confirm.textContent = '✓';
        tb.appendChild(handle);
        tb.appendChild(remove);
        tb.appendChild(confirm);
        wrap.appendChild(tb);

        let dragging = false; let draggingBody = false; let ox=0, oy=0; let wrapRect = null;
        handle.addEventListener('mousedown', (e)=>{ dragging=true; handle.style.cursor='grabbing'; wrapRect = wrap.getBoundingClientRect(); ox=e.clientX - wrapRect.left - tb.offsetLeft; oy=e.clientY - wrapRect.top - tb.offsetTop; e.preventDefault(); });
        tb.addEventListener('mousedown', (e)=>{
            if (e.target === handle || e.target === remove) return;
            // Body drag only when holding Alt/Option to avoid interfering with typing
            if (!e.altKey) return;
            draggingBody = true; tb.classList.add('moving'); wrapRect = wrap.getBoundingClientRect();
            ox = e.clientX - wrapRect.left - tb.offsetLeft; oy = e.clientY - wrapRect.top - tb.offsetTop;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e)=>{
            if(dragging || draggingBody){
                const left0 = (wrapRect ? wrapRect.left : 0);
                const top0 = (wrapRect ? wrapRect.top : 0);
                let nx = (e.clientX - left0 - ox);
                let ny = (e.clientY - top0 - oy);
                // Clamp inside wrapper bounds
                const maxX = Math.max(0, (wrapRect ? wrapRect.width : tb.offsetLeft + nx) - tb.offsetWidth);
                const maxY = Math.max(0, (wrapRect ? wrapRect.height : tb.offsetTop + ny) - tb.offsetHeight);
                if (nx < 0) nx = 0; if (ny < 0) ny = 0;
                if (Number.isFinite(maxX) && nx > maxX) nx = maxX;
                if (Number.isFinite(maxY) && ny > maxY) ny = maxY;
                tb.style.left = nx + 'px'; tb.style.top = ny + 'px';
                ann.xCss = nx; ann.yCss = ny;
            }
        });
        window.addEventListener('mouseup', ()=>{ dragging=false; draggingBody=false; handle.style.cursor='grab'; tb.classList.remove('moving'); });

        // Keep editing always enabled; dragging uses preventDefault on mousedown
        remove.addEventListener('click', ()=>{
            const pageAnns = getAnnotations(currentPageIndex);
            const idx = pageAnns.findIndex(a=>a.id===ann.id);
            if (idx>=0) pageAnns.splice(idx,1);
            tb.remove();
        });
        // Keep handle visible while typing/editing
        tb.addEventListener('focusin', ()=>{ tb.classList.add('editing'); tb.style.color = '#111'; tb.style.webkitTextFillColor = '#111'; tb.style.caretColor = '#111'; const h = tb.querySelector('.handle'); if (h && !ann.locked) h.style.display = 'block'; });
        tb.addEventListener('focusout', ()=>{ tb.classList.remove('editing'); if (!ann.locked) { tb.classList.add('unconfirmed'); const h = tb.querySelector('.handle'); if (h) h.style.display = 'block'; } });
        tb.addEventListener('input', ()=>{ ann.text = getCleanTextFromBox(tb); tb.style.color = ann.color || textDefaults.color; tb.style.webkitTextFillColor = ann.color || textDefaults.color; const h = tb.querySelector('.handle'); if (h && !ann.locked) h.style.display = 'block'; });
        // Font size shortcuts: Cmd/Ctrl + +/- to adjust current box size
        tb.addEventListener('keydown', (e)=>{
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            if (e.key === '+' || e.key === '=' || (e.key === 'ArrowUp' && e.shiftKey)){
                e.preventDefault();
                ann.fontSize = Math.min(72, (ann.fontSize||textDefaults.fontSize) + 1);
                tb.style.fontSize = ann.fontSize + 'px';
            }
            if (e.key === '-' || (e.key === 'ArrowDown' && e.shiftKey)){
                e.preventDefault();
                ann.fontSize = Math.max(6, (ann.fontSize||textDefaults.fontSize) - 1);
                tb.style.fontSize = ann.fontSize + 'px';
            }
        });
        confirm.addEventListener('click', ()=>{
            // Lock content and position; disable editing and dragging
            tb.contentEditable = 'false';
            tb.classList.remove('moving');
            tb.style.borderStyle = 'solid';
            handle.style.display = 'none';
            confirm.style.display = 'none';
            // Persist latest text and coords (exclude controls)
            ann.text = getCleanTextFromBox(tb);
            ann.xCss = tb.offsetLeft; ann.yCss = tb.offsetTop;
            ann.locked = true;
            tb.classList.remove('unconfirmed');
        });
    }

    function addTextAnnotation(xCss, yCss){
        const id = 'ann_' + Math.random().toString(36).slice(2,9);
        const ann = { id, xCss: Number.isFinite(xCss)?xCss:20, yCss: Number.isFinite(yCss)?yCss:20, text: 'Type here', fontSize: Number(textSizeInput.value)||textDefaults.fontSize, color: textColorInput.value || textDefaults.color, font: textFontSelect.value || textDefaults.font, style: textStyleSelect.value || textDefaults.style };
        getAnnotations(currentPageIndex).push(ann);
        renderAnnotationEl(ann);
        // focus newly created textbox
        const wrap = document.querySelector('.canvaswrap');
        const last = wrap.querySelector('.text-box[data-id="'+ann.id+'"]');
        if (last) { last.focus(); }
    }

    function insertTextAtCss(xCss, yCss){
        addTextAnnotation(xCss, yCss);
    }

    addTextBtn.addEventListener('click', () => addTextAnnotation());
    textModeBtn.addEventListener('click', () => { isTextMode = !isTextMode; textModeBtn.setAttribute('aria-pressed', String(isTextMode)); textModeBtn.classList.toggle('active', isTextMode); canvas.style.cursor = isTextMode ? 'text' : 'none'; cursorEl.style.display = isTextMode ? 'none' : 'block'; });
    window.addEventListener('keydown', (e)=>{ if ((e.key==='t' || e.key==='T') && !(e.metaKey||e.ctrlKey||e.altKey)){ e.preventDefault(); textModeBtn.click(); }});

    clearBtn.addEventListener('click', async () => {
        // Clear current page drawings and annotations
        strokesByPage[currentPageIndex] = [];
        redoByPage[currentPageIndex] = [];
        annotationsByPage[currentPageIndex] = [];
        await refreshView();
    });

    undoBtn.addEventListener('click', async () => {
        const paths = getStrokes(currentPageIndex);
        if (paths.length === 0) return;
        const s = paths.pop();
        getRedo(currentPageIndex).push(s);
        await refreshView();
    });

    redoBtn.addEventListener('click', async () => {
        const r = getRedo(currentPageIndex);
        if (r.length === 0) return;
        const s = r.pop();
        getStrokes(currentPageIndex).push(s);
        await refreshView();
    });

    // Keyboard shortcuts: Ctrl/Cmd+Z (undo), Shift+Ctrl/Cmd+Z (redo)
    window.addEventListener('keydown', async (e) => {
        const isMod = e.ctrlKey || e.metaKey;
        if (!isMod) return;
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undoBtn.click(); }
        if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redoBtn.click(); }
    });

    input.addEventListener('change', async () => {
        const file = input.files[0]; if (!file) return;
        const buf = await file.arrayBuffer();
        await loadPdf(buf);
        input.value = '';
    });

    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', async (e) => {
        e.preventDefault(); drop.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const buf = await e.dataTransfer.files[0].arrayBuffer();
            await loadPdf(buf);
        }
    });
    // Paste support: Ctrl/Cmd+V PDF from clipboard
    window.addEventListener('paste', async (e) => {
        const dt = e.clipboardData; if (!dt) return;
        const items = Array.from(dt.items || []);
        const file = items.map(it => it.getAsFile && it.getAsFile()).find(f => f && f.type === 'application/pdf');
        if (file) { e.preventDefault(); const buf = await file.arrayBuffer(); await loadPdf(buf); }
    });
    // Only trigger dialog when clicking outside the button/input to prevent double dialogs
    drop.addEventListener('click', (e) => {
        const inFileButtonArea = e.target && (e.target.id === 'fileInput' || (e.target.closest && e.target.closest('.filewrap')));
        if (!inFileButtonArea) input.click();
    });
    // Prevent bubbling from input
    input.addEventListener('click', (e) => { e.stopPropagation(); });

    downloadBtn.addEventListener('click', async () => {
        try{
            if (!pdfDoc || !originalPdfBytes) { alert('กรุณาโหลดไฟล์ PDF ก่อน'); return; }
            const { rgb, StandardFonts, PDFDocument } = window.PDFLib;
            // Always export from a fresh copy of the original PDF
            const outDoc = await PDFDocument.load(originalPdfBytes);
            const pages = outDoc.getPages ? outDoc.getPages() : [];
            if (!pages || !pages.length){ alert('ไม่พบหน้าสำหรับบันทึก'); return; }
            // prepare fonts map for selected styles
            const fontCache = {};
            async function ensureFont(fontName, style){
                const key = fontName + ':' + style;
                if (fontCache[key]) return fontCache[key];
                let std = StandardFonts.Helvetica;
                if (fontName === 'TimesRoman'){
                    if (style === 'Bold') std = StandardFonts.TimesRomanBold;
                    else if (style === 'Italic') std = StandardFonts.TimesRomanItalic;
                    else if (style === 'BoldItalic') std = StandardFonts.TimesRomanBoldItalic;
                    else std = StandardFonts.TimesRoman;
                } else if (fontName === 'Courier'){
                    if (style === 'Bold') std = StandardFonts.CourierBold;
                    else if (style === 'Italic') std = StandardFonts.CourierOblique;
                    else if (style === 'BoldItalic') std = StandardFonts.CourierBoldOblique;
                    else std = StandardFonts.Courier;
                } else { // Helvetica family
                    if (style === 'Bold') std = StandardFonts.HelveticaBold;
                    else if (style === 'Italic') std = StandardFonts.HelveticaOblique;
                    else if (style === 'BoldItalic') std = StandardFonts.HelveticaBoldOblique;
                    else std = StandardFonts.Helvetica;
                }
                const f = await outDoc.embedFont(std);
                fontCache[key] = f;
                return f;
            }

            // compute canvas->points scale for current page from actual sizes
            const size = pages[currentPageIndex].getSize ? pages[currentPageIndex].getSize() : { width: 612, height: 792 };
            const pageWidthPt = size.width; const pageHeightPt = size.height;
            const wrap = document.querySelector('.canvaswrap');
            const wrapRect = wrap.getBoundingClientRect();
            const cssToCanvasX = canvas.width / (wrapRect.width || 1);
            const cssToCanvasY = canvas.height / (wrapRect.height || 1);
            const canvasToPtX = pageWidthPt / (canvas.width || 1);
            const canvasToPtY = pageHeightPt / (canvas.height || 1);

            // Draw strokes for current page
            getStrokes(currentPageIndex).forEach(path => {
                if (!path || !path.points || path.points.length < 2) return;
                const thicknessPt = path.size * canvasToPtX;
                for (let i=1;i<path.points.length;i++){
                    const p0 = path.points[i-1];
                    const p1 = path.points[i];
                    const start = { x: p0.x * canvasToPtX, y: pageHeightPt - (p0.y * canvasToPtY) };
                    const end = { x: p1.x * canvasToPtX, y: pageHeightPt - (p1.y * canvasToPtY) };
                    pages[currentPageIndex].drawLine({ start, end, thickness: thicknessPt, color: rgb(10/255, 102/255, 255/255) });
                }
            });

            // Draw text annotations for current page
            for (const ann of getAnnotations(currentPageIndex)){
                const xCanvas = Math.max(0, (ann.xCss || 0)) * cssToCanvasX;
                const yCanvasTop = Math.max(0, (ann.yCss || 0)) * cssToCanvasY;
                const textRaw = (ann.text || '').replace(/\s+$/,'');
                if (!textRaw) continue;
                const lines = textRaw.split(/\n/);
                const fontSize = Math.max(6, Math.min(72, ann.fontSize || 14));
                const colorHex = (ann.color || '#111111').replace('#','');
                const r = parseInt(colorHex.substring(0,2),16)/255;
                const g = parseInt(colorHex.substring(2,4),16)/255;
                const b = parseInt(colorHex.substring(4,6),16)/255;
                const font = await ensureFont(ann.font || 'Helvetica', ann.style || 'Normal');
                const lineGap = Math.round(fontSize * 1.2);
                for (let i=0;i<lines.length;i++){
                    // Position baseline inside the box; clamp into page bounds
                    const yPdf = Math.max(0, Math.min(pageHeightPt, pageHeightPt - ((yCanvasTop + lineGap*(i+0.8)) * canvasToPtY)));
                    const xPdf = Math.max(0, Math.min(pageWidthPt, xCanvas * canvasToPtX));
                    pages[currentPageIndex].drawText(lines[i], { x: xPdf, y: yPdf, size: fontSize, color: rgb(r,g,b), font });
                }
            }

            const bytes = await outDoc.save();
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'signed.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(()=>URL.revokeObjectURL(url),1000);
        }catch(err){ console.error(err); alert('ไม่สามารถดาวน์โหลดได้: ' + (err && err.message ? err.message : String(err))); }
    });
})();


