// Extracted from converter.html inline script to satisfy CSP
(function(){
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const outputFormat = document.getElementById('outputFormat');
    const quality = document.getElementById('quality');
    const convertBtn = document.getElementById('convertBtn');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const progressEl = document.getElementById('progress');
    const hintEl = document.getElementById('hint');
    const errorEl = document.getElementById('error');
    const errorBox = document.getElementById('errorBox');
    const fileList = document.getElementById('fileList');

    let selectedFiles = [];
    let convertedFiles = [];
    let previewUrls = [];

    // Limits to prevent client-side overload/abuse
    const MAX_FILES = 50; // maximum number of files processed per batch
    const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB per file

    const fileIcons = {
        'image': '🖼️',
        'audio': '🎵',
        'video': '🎬',
        'text': '📄',
        'application': '📋',
        'default': '📁'
    };

    const supportedConversions = {
        // Images: raster <-> raster, svg -> raster
        'image/jpeg': ['image/png', 'image/webp'],
        'image/png': ['image/jpeg', 'image/webp'],
        'image/webp': ['image/jpeg', 'image/png'],
        'image/gif': ['image/jpeg', 'image/png', 'image/webp'],
        'image/svg+xml': ['image/png', 'image/jpeg', 'image/webp'],
        // Text/Markup/JSON
        'text/plain': ['text/html', 'application/json'],
        'text/html': ['text/plain', 'application/json'],
        'application/json': ['text/plain', 'text/html']
    };

    function setError(msg) { errorEl.textContent = msg || ''; }
    function logError(message, detail) { const lines = []; if (message) lines.push(message); if (detail) lines.push(String(detail)); errorBox.textContent = lines.join('\n'); errorBox.style.display = lines.length ? 'block' : 'none'; }

    function updateHint() {
        if (selectedFiles.length === 0) { hintEl.textContent = 'Select files and choose output format to begin conversion.'; return; }
        const format = outputFormat.value;
        if (!format) { hintEl.textContent = `${selectedFiles.length} file(s) selected. Choose output format.`; return; }
        hintEl.textContent = `${selectedFiles.length} file(s) ready to convert to ${format.split('/')[1].toUpperCase()}.`;
    }

    function getFileIcon(file) { const type = (file.type||'').split('/')[0]; return fileIcons[type] || fileIcons.default; }
    function formatFileSize(bytes) { if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]; }
    function getFileExtension(mimeType) {
        const extensions = { 'image/jpeg': 'jpg','image/png': 'png','image/webp': 'webp','image/gif': 'gif','image/svg+xml': 'svg','application/pdf': 'pdf','text/plain': 'txt','text/html': 'html','text/css': 'css','application/json': 'json','audio/mpeg': 'mp3','audio/wav': 'wav','audio/ogg': 'ogg','audio/aac': 'aac','video/mp4': 'mp4','video/webm': 'webm','video/ogg': 'ogv' };
        return extensions[mimeType] || 'bin';
    }
    function guessMimeFromName(name){
        const n = (name || '').toLowerCase();
        if (/.+\.(jpe?g)$/i.test(n)) return 'image/jpeg';
        if (/.+\.(png)$/i.test(n)) return 'image/png';
        if (/.+\.(webp)$/i.test(n)) return 'image/webp';
        if (/.+\.(gif)$/i.test(n)) return 'image/gif';
        if (/.+\.(svg)$/i.test(n)) return 'image/svg+xml';
        if (/.+\.(pdf)$/i.test(n)) return 'application/pdf';
        if (/.+\.(txt)$/i.test(n)) return 'text/plain';
        if (/.+\.(html?|xhtml)$/i.test(n)) return 'text/html';
        if (/.+\.(css)$/i.test(n)) return 'text/css';
        if (/.+\.(json)$/i.test(n)) return 'application/json';
        if (/.+\.(mp3)$/i.test(n)) return 'audio/mpeg';
        if (/.+\.(wav)$/i.test(n)) return 'audio/wav';
        if (/.+\.(ogg)$/i.test(n)) return 'audio/ogg';
        if (/.+\.(aac)$/i.test(n)) return 'audio/aac';
        if (/.+\.(mp4)$/i.test(n)) return 'video/mp4';
        if (/.+\.(webm)$/i.test(n)) return 'video/webm';
        if (/.+\.(ogv)$/i.test(n)) return 'video/ogg';
        return '';
    }
    function getFromType(file){ return (file && (file.type || guessMimeFromName(file.name))) || ''; }
    function canConvert(fromType, toType) { if (supportedConversions[fromType]) return supportedConversions[fromType].includes(toType); return fromType === toType; }

    async function loadImageFromFile(file){
        return new Promise((resolve, reject) => {
            try{
                const url = URL.createObjectURL(file);
                previewUrls.push(url);
                const img = new Image();
                img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
                img.src = url;
            }catch(e){ reject(e); }
        });
    }

    function canvasToBlob(canvas, type, quality){
        return new Promise((resolve, reject) => {
            try{
                canvas.toBlob((blob) => {
                    if (!blob) { reject(new Error('Failed to generate blob')); return; }
                    resolve(blob);
                }, type, quality);
            }catch(e){ reject(e); }
        });
    }

    async function convertImage(file, toType, qualityValue){
        const img = await loadImageFromFile(file);
        const canvas = document.createElement('canvas');
        const width = Math.max(1, img.naturalWidth || img.width || 1);
        const height = Math.max(1, img.naturalHeight || img.height || 1);
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: true });
        ctx.drawImage(img, 0, 0, width, height);
        // GIF encoding is not natively supported by canvas; fall back to PNG
        const actualType = (toType === 'image/gif') ? 'image/png' : toType;
        return await canvasToBlob(canvas, actualType, isFinite(qualityValue) ? qualityValue : undefined);
    }

    function escapeHtml(text){
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function htmlToText(html){
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(html || ''), 'text/html');
        return doc.body.textContent || '';
    }

    async function convertText(file, fromType, toType){
        const buf = await file.arrayBuffer();
        const text = new TextDecoder().decode(buf);
        if (fromType === 'text/plain' && toType === 'text/html'){
            const html = '<!doctype html><meta charset="utf-8"><pre>' + escapeHtml(text) + '</pre>';
            return new Blob([html], { type: 'text/html' });
        }
        if (fromType === 'text/plain' && toType === 'application/json'){
            let value = text;
            try{ value = JSON.parse(text); }catch(_){ /* keep as string */ }
            const json = JSON.stringify(value, null, 2);
            return new Blob([json], { type: 'application/json' });
        }
        if (fromType === 'text/html' && toType === 'text/plain'){
            const plain = htmlToText(text);
            return new Blob([plain], { type: 'text/plain' });
        }
        if (fromType === 'text/html' && toType === 'application/json'){
            const plain = htmlToText(text);
            const json = JSON.stringify({ text: plain }, null, 2);
            return new Blob([json], { type: 'application/json' });
        }
        if (fromType === 'application/json' && toType === 'text/plain'){
            let obj;
            try{ obj = JSON.parse(text); }catch(_){ obj = text; }
            const out = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
            return new Blob([out], { type: 'text/plain' });
        }
        if (fromType === 'application/json' && toType === 'text/html'){
            let obj;
            try{ obj = JSON.parse(text); }catch(_){ obj = text; }
            const jsonPretty = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
            const html = '<!doctype html><meta charset="utf-8"><pre>' + escapeHtml(jsonPretty) + '</pre>';
            return new Blob([html], { type: 'text/html' });
        }
        // Fallback: return original
        return new Blob([text], { type: fromType || 'application/octet-stream' });
    }

    async function convertFile(file, toType, qualityValue){
        const fromType = file.type || '';
        if (!toType || (!fromType && !supportedConversions[fromType])) return null;
        if (fromType.startsWith('image/') || fromType === 'image/svg+xml'){
            try { return await convertImage(file, toType, qualityValue); } catch(e){ throw e; }
        }
        if (fromType.startsWith('text/') || fromType === 'application/json'){
            return await convertText(file, fromType, toType);
        }
        // If conversion between same type is requested or unsupported category, just return original
        if (fromType === toType) return file;
        return null;
    }

    function renderFileList() {
        try{ previewUrls.forEach(u=>URL.revokeObjectURL(u)); }catch(_){ }
        previewUrls = [];
        fileList.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div'); fileItem.className = 'file-item';
            const fromType = getFromType(file);
            const canConvertTo = outputFormat.value && canConvert(fromType, outputFormat.value);
            let leftEl;
            if (fromType && fromType.startsWith('image/')) {
                const url = URL.createObjectURL(file); previewUrls.push(url);
                const img = document.createElement('img'); img.className = 'file-thumb'; img.alt = 'preview'; img.src = url; leftEl = img;
            } else {
                const iconWrap = document.createElement('div'); iconWrap.className = 'file-icon'; iconWrap.textContent = getFileIcon(file); leftEl = iconWrap;
            }
            const info = document.createElement('div'); info.className = 'file-info';
            const name = document.createElement('div'); name.className = 'file-name'; name.title = file.name || ''; name.textContent = file.name || '';
            const size = document.createElement('div'); size.className = 'file-size'; size.textContent = formatFileSize(file.size||0);
            const format = document.createElement('div'); format.className = 'file-format';
            const statusBadgeEl = document.createElement('span');
            if (!outputFormat.value) { statusBadgeEl.className = 'status-badge neutral'; statusBadgeEl.textContent = 'Choose format'; }
            else if (canConvertTo) { statusBadgeEl.className = 'status-badge ok'; statusBadgeEl.textContent = 'Available'; }
            else { statusBadgeEl.className = 'status-badge no'; statusBadgeEl.textContent = 'Not supported'; }
            format.textContent = fromType || '';
            format.appendChild(document.createTextNode(' '));
            format.appendChild(statusBadgeEl);
            info.appendChild(name); info.appendChild(size); info.appendChild(format);
            const actions = document.createElement('div'); actions.className = 'file-actions';
            const btn = document.createElement('button'); btn.className = 'icon-button danger-outline'; btn.style.width='36px'; btn.style.height='32px'; btn.style.borderRadius='10px'; btn.title='Remove'; btn.setAttribute('aria-label','Remove');
            btn.addEventListener('click', ()=> removeFile(index));
            const icon = document.createElement('img'); icon.alt=''; icon.setAttribute('aria-hidden','true'); icon.width=18; icon.height=18; icon.style.display='block'; icon.src="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23dc3545' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='3 6 5 6 21 6'/%3E%3Cpath d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/%3E%3Cpath d='M10 11v6'/%3E%3Cpath d='M14 11v6'/%3E%3Cpath d='M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'/%3E%3C/svg%3E";
            btn.appendChild(icon);
            actions.appendChild(btn);
            fileItem.appendChild(leftEl);
            fileItem.appendChild(info);
            fileItem.appendChild(actions);
            fileList.appendChild(fileItem);
        });
    }

    function updateFormatOptionsState(){
        const opts = Array.from(outputFormat.querySelectorAll('option'));
        let current = outputFormat.value;
        let currentStillAllowed = true;
        opts.forEach(opt => {
            if (!opt.value) return;
            if (selectedFiles.length === 0){ opt.disabled = false; opt.hidden = false; return; }
            const allowed = selectedFiles.some(f=>canConvert(getFromType(f), opt.value));
            opt.disabled = !allowed;
            opt.hidden = !allowed;
            if (opt.value === current && !allowed){ currentStillAllowed = false; }
        });
        if (!currentStillAllowed){ outputFormat.value = ''; }
    }

    function removeFile(index) { selectedFiles.splice(index, 1); updateUI(); }
    function updateUI() {
        const format = outputFormat.value;
        const canConvertAny = selectedFiles.some(file => canConvert(getFromType(file), format));
        updateFormatOptionsState();
        convertBtn.disabled = selectedFiles.length === 0 || !format || !canConvertAny;
        downloadAllBtn.disabled = convertedFiles.length === 0;
        updateHint();
        renderFileList();
    }

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); const files = (e.dataTransfer && e.dataTransfer.files) ? Array.from(e.dataTransfer.files) : []; if (files.length) handleFiles(files); });
    dropZone.addEventListener('click', (e) => { const inFileArea = e.target && (e.target.id === 'fileInput' || (e.target.closest && e.target.closest('input[type="file"]'))); if (!inFileArea) fileInput.click(); });
    fileInput.addEventListener('click', (e) => { e.stopPropagation(); });
    window.addEventListener('paste', (e) => { const dt = e.clipboardData; if (!dt) return; const items = Array.from(dt.items || []); const files = items.map(it => it.getAsFile && it.getAsFile()).filter(Boolean); if (files.length) { e.preventDefault(); handleFiles(files); return; } const text = dt.getData && dt.getData('text'); if (text) { const blob = new Blob([text], { type: 'text/plain' }); blob.name = 'pasted.txt'; handleFiles([blob]); } }, { passive: false });
    function handleFiles(files) {
        const incoming = Array.from(files || []);
        const messages = [];
        let limited = incoming;
        if (incoming.length > MAX_FILES){
            limited = incoming.slice(0, MAX_FILES);
            messages.push(`Some files were skipped: limit is ${MAX_FILES} files per batch.`);
        }
        const accepted = [];
        const rejected = [];
        for (const f of limited){ if (f && typeof f.size === 'number' && f.size > MAX_FILE_SIZE_BYTES) { rejected.push(f.name || 'file'); } else { accepted.push(f); } }
        if (rejected.length){ messages.push(`Skipped ${rejected.length} file(s) over ${(MAX_FILE_SIZE_BYTES/1024/1024)|0}MB.`); }
        selectedFiles = accepted;
        convertedFiles = [];
        setError(accepted.length ? '' : 'No files accepted.');
        logError(messages.join('\n'));
        updateUI();
    }
    fileInput.addEventListener('change', () => { handleFiles(Array.from(fileInput.files || [])); fileInput.value=''; });

    outputFormat.addEventListener('change', updateUI);
    convertBtn.addEventListener('click', async () => {
        const format = outputFormat.value; const qualityValue = parseFloat(quality.value);
        if (!format || selectedFiles.length === 0) return;
        convertBtn.disabled = true; progressEl.classList.remove('hidden'); progressEl.value = 0; convertedFiles = [];
        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                const fromType = getFromType(file);
                if (!canConvert(fromType, format) && fromType !== format) {
                    console.log(`Skipping ${file.name} - conversion not supported`);
                    progressEl.value = (i + 1) / selectedFiles.length;
                    continue;
                }
                let outBlob = null;
                try {
                    outBlob = await convertFile(file, format, qualityValue);
                } catch (e) {
                    console.warn('Failed to convert', file && file.name, e);
                }
                if (!outBlob) { outBlob = file; }
                const ext = getFileExtension(format);
                let outFile = outBlob;
                try {
                    const name = (file && file.name) || 'file';
                    const dot = name.lastIndexOf('.');
                    const base = dot > 0 ? name.substring(0, dot) : name;
                    outFile = new File([outBlob], `${base}.${ext}` , { type: format || (outBlob && outBlob.type) || 'application/octet-stream' });
                } catch(_){ /* older browsers without File constructor */ }
                convertedFiles.push({ original: file, converted: outFile, format: format, extension: ext });
                progressEl.value = (i + 1) / selectedFiles.length;
            }
            updateUI(); setError(''); logError('');
        } catch (error) { setError('Conversion failed'); logError('Conversion error:', error); }
        finally { convertBtn.disabled = false; progressEl.classList.add('hidden'); }
    });

    downloadAllBtn.addEventListener('click', () => {
        if (convertedFiles.length === 0) return;
        convertedFiles.forEach((fileInfo) => {
            const originalName = (fileInfo.original && fileInfo.original.name) || 'file';
            const dot = originalName.lastIndexOf('.');
            const base = dot > 0 ? originalName.substring(0, dot) : originalName;
            const newName = `${base}.${fileInfo.extension || 'bin'}`;
            const url = URL.createObjectURL(fileInfo.converted);
            const a = document.createElement('a'); a.href = url; a.download = newName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        });
    });

    updateUI();
})();


