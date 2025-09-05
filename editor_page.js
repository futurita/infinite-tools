// Extracted from editor.html to satisfy CSP and remove inline scripts
(function(){
    // Canvas and context
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const overlay = document.getElementById('overlay');

    // UI elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const editorLayout = document.getElementById('editorLayout');
    const statusBar = document.getElementById('statusBar');
    const errorBox = document.getElementById('errorBox');

    // Tools
    const toolButtons = document.querySelectorAll('.tool-btn');
    const brushSize = document.getElementById('brushSize');
    const brushColor = document.getElementById('brushColor');
    const colorValue = document.getElementById('colorValue');

    // Adjustments
    const brightness = document.getElementById('brightness');
    const contrast = document.getElementById('contrast');
    const saturation = document.getElementById('saturation');
    const hue = document.getElementById('hue');

    // Transform
    const rotation = document.getElementById('rotation');
    const scale = document.getElementById('scale');
    const flip = document.getElementById('flip');

    // Actions
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const clearElementsBtn = document.getElementById('clearElementsBtn');

    // State
    let currentTool = 'crop';
    let isDrawing = false;
    let isSelecting = false;
    let isCropping = false;
    let isAddingText = false;
    let isDrawingShape = false;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let originalImage = null;
    let history = [];
    let historyIndex = -1;
    let currentImageData = null;
    let selectionRect = null;
    let cropRect = null;
    let textElements = [];
    let shapes = [];
    let selectedTextIndex = -1;
    let selectedShapeIndex = -1;

    // Initialize
    initCanvas();
    initEventListeners();

    function initCanvas() {
        canvas.width = 800;
        canvas.height = 600;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        updateStatusBar();
    }

    function initEventListeners() {
        // File handling
        fileInput.addEventListener('change', () => {
            const f = fileInput.files && fileInput.files[0];
            if (f) { loadImage(f); fileInput.value = ''; }
        });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            const file = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) || null;
            if (file) { loadImage(file); fileInput.value = ''; }
        });
        window.addEventListener('paste', (e) => {
            const dt = e.clipboardData; if (!dt) return;
            const items = Array.from(dt.items || []);
            const file = items.map(it => it.getAsFile && it.getAsFile()).find(f => f && f.type && f.type.startsWith('image/'));
            if (file) { e.preventDefault(); loadImage(file); fileInput.value = ''; }
        });
        dropZone.addEventListener('click', (e) => {
            const inFileArea = e.target && (e.target.id === 'fileInput' || (e.target.closest && e.target.closest('input[type="file"]')));
            if (!inFileArea) fileInput.click();
        });
        fileInput.addEventListener('click', (e) => { e.stopPropagation(); });

        // Tool selection
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTool = btn.dataset.tool;
                updateStatusBar();
            });
        });
        brushColor.addEventListener('change', (e) => { colorValue.textContent = e.target.value; });

        // Canvas events
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseout', handleMouseOut);
        canvas.addEventListener('dblclick', handleDoubleClick);

        // Adjustments
        [brightness, contrast, saturation, hue].forEach(slider => { slider.addEventListener('input', applyAdjustments); });
        // Transform
        [rotation, scale, flip].forEach(control => { control.addEventListener('change', applyTransform); });
        // Filter presets
        document.querySelectorAll('.filter-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                document.querySelectorAll('.filter-preset').forEach(p => p.classList.remove('active'));
                preset.classList.add('active');
                applyFilter(preset.dataset.filter);
            });
        });

        // Actions
        saveBtn.addEventListener('click', saveImage);
        resetBtn.addEventListener('click', resetImage);
        undoBtn.addEventListener('click', undo);
        redoBtn.addEventListener('click', redo);
        clearElementsBtn.addEventListener('click', clearElements);
    }

    function loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                fitImageToCanvas(img);
                saveToHistory();
                dropZone.style.display = 'none';
                editorLayout.style.display = 'grid';
                updateStatusBar();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function fitImageToCanvas(img) {
        const canvasAspect = canvas.width / canvas.height;
        const imageAspect = img.width / img.height;
        let drawWidth, drawHeight, offsetX, offsetY;
        if (imageAspect > canvasAspect) {
            drawWidth = canvas.width;
            drawHeight = canvas.width / imageAspect;
            offsetX = 0;
            offsetY = (canvas.height - drawHeight) / 2;
        } else {
            drawHeight = canvas.height;
            drawWidth = canvas.height * imageAspect;
            offsetX = (canvas.width - drawWidth) / 2;
            offsetY = 0;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        drawTextElements();
        drawShapes();
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function handleMouseDown(e) {
        const pos = getMousePos(e);
        startX = pos.x; startY = pos.y; lastX = pos.x; lastY = pos.y;
        switch (currentTool) {
            case 'select': isSelecting = true; selectionRect = { x: pos.x, y: pos.y, width: 0, height: 0 }; break;
            case 'crop': isCropping = true; cropRect = { x: pos.x, y: pos.y, width: 0, height: 0 }; break;
            case 'draw': isDrawing = true; break;
            case 'text': addText(pos.x, pos.y); break;
            case 'shape': isDrawingShape = true; break;
        }
    }
    function handleMouseMove(e) {
        const pos = getMousePos(e);
        if (isDrawing && currentTool === 'draw') {
            ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = brushColor.value; ctx.lineWidth = brushSize.value; ctx.lineCap = 'round'; ctx.stroke();
            lastX = pos.x; lastY = pos.y;
        }
        if (isSelecting && currentTool === 'select') {
            selectionRect.width = pos.x - startX; selectionRect.height = pos.y - startY; drawSelectionOverlay();
        }
        if (isCropping && currentTool === 'crop') {
            cropRect.width = pos.x - startX; cropRect.height = pos.y - startY; drawCropOverlay();
        }
        if (isDrawingShape && currentTool === 'shape') { drawShapePreview(pos.x, pos.y); }
    }
    function handleMouseUp(e) {
        const pos = getMousePos(e);
        if (isSelecting && currentTool === 'select') { isSelecting = false; updateStatusBar(); }
        if (isCropping && currentTool === 'crop') { isCropping = false; applyCrop(); }
        if (isDrawing && currentTool === 'draw') { isDrawing = false; saveToHistory(); }
        if (isDrawingShape && currentTool === 'shape') { isDrawingShape = false; addShape(startX, startY, pos.x, pos.y); }
    }
    function handleMouseOut() { if (isDrawing) { isDrawing = false; saveToHistory(); } if (isSelecting) isSelecting = false; if (isCropping) isCropping = false; if (isDrawingShape) isDrawingShape = false; }
    function handleDoubleClick(e) { if (currentTool === 'text') { const pos = getMousePos(e); addText(pos.x, pos.y); } }

    function drawSelectionOverlay() {
        overlay.innerHTML = '';
        if (selectionRect) {
            const div = document.createElement('div');
            div.style.position = 'absolute'; div.style.left = selectionRect.x + 'px'; div.style.top = selectionRect.y + 'px';
            div.style.width = Math.abs(selectionRect.width) + 'px'; div.style.height = Math.abs(selectionRect.height) + 'px';
            div.style.border = '2px dashed #007bff'; div.style.backgroundColor = 'rgba(0, 123, 255, 0.1)'; div.style.pointerEvents = 'none';
            overlay.appendChild(div);
        }
    }
    function drawCropOverlay() {
        overlay.innerHTML = '';
        if (cropRect) {
            const div = document.createElement('div');
            div.style.position = 'absolute'; div.style.left = cropRect.x + 'px'; div.style.top = cropRect.y + 'px';
            div.style.width = Math.abs(cropRect.width) + 'px'; div.style.height = Math.abs(cropRect.height) + 'px';
            div.style.border = '2px solid #dc3545'; div.style.backgroundColor = 'rgba(220, 53, 69, 0.1)'; div.style.pointerEvents = 'none';
            overlay.appendChild(div);
        }
    }
    function applyCrop() {
        if (!cropRect || Math.abs(cropRect.width) < 10 || Math.abs(cropRect.height) < 10) { overlay.innerHTML = ''; return; }
        const x = Math.min(cropRect.x, cropRect.x + cropRect.width);
        const y = Math.min(cropRect.y, cropRect.y + cropRect.height);
        const width = Math.abs(cropRect.width); const height = Math.abs(cropRect.height);
        const tempCanvas = document.createElement('canvas'); const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = width; tempCanvas.height = height;
        tempCtx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
        canvas.width = width; canvas.height = height; ctx.drawImage(tempCanvas, 0, 0);
        overlay.innerHTML = ''; saveToHistory(); updateStatusBar();
    }

    function addText(x, y) {
        const text = prompt('Enter text:');
        if (text) {
            const textElement = { x, y, text, color: brushColor.value, size: parseInt(brushSize.value) * 2, font: 'Arial' };
            textElements.push(textElement); drawTextElements(); saveToHistory();
        }
    }
    function drawTextElements() {
        textElements.forEach(element => { ctx.font = `${element.size}px ${element.font}`; ctx.fillStyle = element.color; ctx.fillText(element.text, element.x, element.y); });
    }

    function addShape(startX, startY, endX, endY) {
        const shape = { type: 'rectangle', x: Math.min(startX, endX), y: Math.min(startY, endY), width: Math.abs(endX - startX), height: Math.abs(endY - startY), color: brushColor.value, lineWidth: parseInt(brushSize.value) };
        shapes.push(shape); drawShapes(); saveToHistory();
    }
    function drawShapes() {
        shapes.forEach(shape => { ctx.strokeStyle = shape.color; ctx.lineWidth = shape.lineWidth; ctx.strokeRect(shape.x, shape.y, shape.width, shape.height); });
    }
    function drawShapePreview(currentX, currentY) {
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (originalImage) { fitImageToCanvas(originalImage); }
        drawTextElements(); drawShapes(); ctx.strokeStyle = brushColor.value; ctx.lineWidth = parseInt(brushSize.value);
        ctx.strokeRect(Math.min(startX, currentX), Math.min(startY, currentY), Math.abs(currentX - startX), Math.abs(currentY - startY));
    }

    function applyAdjustments() {
        if (!originalImage) return; fitImageToCanvas(originalImage);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height); const data = imageData.data;
        const brightnessValue = parseInt(brightness.value); const contrastValue = parseInt(contrast.value); const saturationValue = parseInt(saturation.value); const hueValue = parseInt(hue.value);
        if (brightnessValue === 0 && contrastValue === 0 && saturationValue === 0 && hueValue === 0) { drawTextElements(); drawShapes(); return; }
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i], g = data[i + 1], b = data[i + 2];
            if (brightnessValue !== 0) { r = Math.max(0, Math.min(255, r + brightnessValue)); g = Math.max(0, Math.min(255, g + brightnessValue)); b = Math.max(0, Math.min(255, b + brightnessValue)); }
            if (contrastValue !== 0) { const factor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue)); r = Math.max(0, Math.min(255, factor * (r - 128) + 128)); g = Math.max(0, Math.min(255, factor * (g - 128) + 128)); b = Math.max(0, Math.min(255, factor * (b - 128) + 128)); }
            if (saturationValue !== 0) { const gray = 0.299 * r + 0.587 * g + 0.114 * b; const factor = 1 + (saturationValue / 100); r = Math.max(0, Math.min(255, gray + factor * (r - gray))); g = Math.max(0, Math.min(255, gray + factor * (g - gray))); b = Math.max(0, Math.min(255, gray + factor * (b - gray))); }
            if (hueValue !== 0) { const hsl = rgbToHsl(r, g, b); hsl[0] = (hsl[0] + hueValue) % 360; if (hsl[0] < 0) hsl[0] += 360; const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]); r = rgb[0]; g = rgb[1]; b = rgb[2]; }
            data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
        ctx.putImageData(imageData, 0, 0); drawTextElements(); drawShapes();
    }
    function rgbToHsl(r, g, b) { r/=255; g/=255; b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b); let h,s,l=(max+min)/2; if(max===min){h=s=0;}else{const d=max-min; s=l>0.5? d/(2-max-min): d/(max+min); switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break} h/=6;} return [h*360, s*100, l*100]; }
    function hslToRgb(h, s, l) { h/=360; s/=100; l/=100; let r,g,b; if(s===0){r=g=b=l;} else { const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }; const q=l<0.5? l*(1+s): l+s-l*s; const p=2*l-q; r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);} return [Math.round(r*255),Math.round(g*255),Math.round(b*255)]; }

    function applyFilter(filterName) {
        if (!originalImage) return; fitImageToCanvas(originalImage);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height); const data = imageData.data;
        switch (filterName) {
            case 'none': break;
            case 'grayscale': for (let i=0;i<data.length;i+=4){ const gray=data[i]*0.299+data[i+1]*0.587+data[i+2]*0.114; data[i]=gray; data[i+1]=gray; data[i+2]=gray; } break;
            case 'sepia': for (let i=0;i<data.length;i+=4){ const r=data[i], g=data[i+1], b=data[i+2]; data[i]=Math.min(255,(r*0.393)+(g*0.769)+(b*0.189)); data[i+1]=Math.min(255,(r*0.349)+(g*0.686)+(b*0.168)); data[i+2]=Math.min(255,(r*0.272)+(g*0.534)+(b*0.131)); } break;
            case 'invert': for (let i=0;i<data.length;i+=4){ data[i]=255-data[i]; data[i+1]=255-data[i+1]; data[i+2]=255-data[i+2]; } break;
            case 'blur': { const temp=new Uint8ClampedArray(data); for(let y=1;y<canvas.height-1;y++){ for(let x=1;x<canvas.width-1;x++){ const idx=(y*canvas.width+x)*4; for(let c=0;c<3;c++){ let sum=0; for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ const nIdx=((y+dy)*canvas.width+(x+dx))*4; sum+=temp[nIdx+c]; } } data[idx+c]=sum/9; } } } } break;
            case 'sharpen': { const temp2=new Uint8ClampedArray(data); for(let y=1;y<canvas.height-1;y++){ for(let x=1;x<canvas.width-1;x++){ const idx=(y*canvas.width+x)*4; for(let c=0;c<3;c++){ const center=temp2[idx+c]; const top=temp2[((y-1)*canvas.width+x)*4+c]; const bottom=temp2[((y+1)*canvas.width+x)*4+c]; const left=temp2[(y*canvas.width+(x-1))*4+c]; const right=temp2[(y*canvas.width+(x+1))*4+c]; const sharpened=center*5-top-bottom-left-right; data[idx+c]=Math.max(0,Math.min(255,sharpened)); } } } } break;
        }
        ctx.putImageData(imageData, 0, 0); drawTextElements(); drawShapes();
    }

    function applyTransform() {
        if (!originalImage) return; const rotationValue=parseInt(rotation.value); const scaleValue=parseFloat(scale.value); const flipValue=flip.value;
        if (rotationValue===0 && scaleValue===1 && flipValue==='none'){ fitImageToCanvas(originalImage); return; }
        ctx.save(); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.translate(canvas.width/2, canvas.height/2); ctx.rotate((rotationValue*Math.PI)/180); ctx.scale(scaleValue, scaleValue);
        if (flipValue==='horizontal'){ ctx.scale(-1,1); } else if (flipValue==='vertical'){ ctx.scale(1,-1); }
        const canvasAspect=canvas.width/canvas.height; const imageAspect=originalImage.width/originalImage.height; let drawWidth, drawHeight;
        if (imageAspect>canvasAspect){ drawWidth=canvas.width; drawHeight=canvas.width/imageAspect; } else { drawHeight=canvas.height; drawWidth=canvas.height*imageAspect; }
        ctx.drawImage(originalImage, -drawWidth/2, -drawHeight/2, drawWidth, drawHeight); ctx.restore(); drawTextElements(); drawShapes();
    }

    function saveToHistory() {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        history = history.slice(0, historyIndex + 1);
        history.push({ imageData, textElements: JSON.parse(JSON.stringify(textElements)), shapes: JSON.parse(JSON.stringify(shapes)) });
        historyIndex = history.length - 1; updateHistoryButtons();
    }
    function undo() { if (historyIndex > 0) { historyIndex--; const state = history[historyIndex]; ctx.putImageData(state.imageData, 0, 0); textElements = state.textElements; shapes = state.shapes; updateHistoryButtons(); } }
    function redo() { if (historyIndex < history.length - 1) { historyIndex++; const state = history[historyIndex]; ctx.putImageData(state.imageData, 0, 0); textElements = state.textElements; shapes = state.shapes; updateHistoryButtons(); } }
    function updateHistoryButtons() { undoBtn.disabled = historyIndex <= 0; redoBtn.disabled = historyIndex >= history.length - 1; }

    function resetImage() {
        if (originalImage) {
            textElements = []; shapes = []; selectionRect = null; cropRect = null; overlay.innerHTML = '';
            fitImageToCanvas(originalImage); saveToHistory();
            brightness.value = 0; contrast.value = 0; saturation.value = 0; hue.value = 0; rotation.value = 0; scale.value = 1; flip.value = 'none';
            document.querySelectorAll('.filter-preset').forEach(p => p.classList.remove('active'));
            const none = document.querySelector('[data-filter="none"]'); if (none) none.classList.add('active');
        }
    }
    function saveImage() { const link = document.createElement('a'); link.download = 'edited-image.png'; link.href = canvas.toDataURL(); link.click(); }
    function clearElements() { textElements = []; shapes = []; selectionRect = null; cropRect = null; overlay.innerHTML = ''; if (originalImage) { fitImageToCanvas(originalImage); } saveToHistory(); }
    function updateStatusBar() {
        const toolNames = { 'select': 'Select Tool - Click and drag to select area', 'crop': 'Crop Tool - Click and drag to crop image', 'draw': 'Draw Tool - Click and drag to draw', 'text': 'Text Tool - Click to add text', 'shape': 'Shape Tool - Click and drag to draw rectangle' };
        statusBar.textContent = toolNames[currentTool] || 'No tool selected';
    }
})();


