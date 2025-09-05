(function(){
	function normalizeMode(mode){
		switch((mode||'any').toLowerCase()){
			case 'images': return 'images';
			case 'imagesorpdf': return 'imagesOrPdf';
			default: return 'any';
		}
	}

	function buildTypesForMode(mode){
		if (mode === 'images') {
			return [{ description: 'Images', accept: { 'image/*': ['.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp'] } }];
		}
		if (mode === 'imagesOrPdf') {
			return [{ description: 'Images/PDF', accept: { 'image/*': ['.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp'], 'application/pdf': ['.pdf'] } }];
		}
		return [{ description: 'All Files', accept: { '*/*': ['.*'] } }];
	}

	function buildAcceptAttr(mode){
		if (mode === 'images') return 'image/*,image/svg+xml';
		if (mode === 'imagesOrPdf') return 'image/*,image/svg+xml,application/pdf';
		return '';
	}

	function filterByMode(files, mode){
		const arr = Array.from(files||[]);
		if (mode === 'any') return arr;
		return arr.filter(f=>{
			if (!f) return false;
			if (mode === 'images') {
				if (f.type && (f.type.startsWith('image/') || f.type === 'image/svg+xml')) return true;
				const n=(f.name||'').toLowerCase();
				return /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(n);
			}
			if (mode === 'imagesOrPdf') {
				if (f.type && (f.type.startsWith('image/') || f.type === 'image/svg+xml' || f.type === 'application/pdf')) return true;
				const n=(f.name||'').toLowerCase();
				return /\.(png|jpe?g|gif|svg|webp|bmp|pdf)$/i.test(n);
			}
			return true;
		});
	}

	function openWithTempInput({ multiple, accept }){
		return new Promise(resolve => {
			const temp = document.createElement('input');
			temp.type = 'file';
			if (multiple) temp.multiple = true;
			if (accept) temp.accept = accept;
			temp.style.position = 'fixed';
			temp.style.left = '-9999px';
			temp.style.top = '0';
			temp.style.opacity = '0';
			document.body.appendChild(temp);
			const onChange = () => {
				temp.removeEventListener('change', onChange);
				const arr = Array.from(temp.files || []);
				document.body.removeChild(temp);
				resolve(arr);
			};
			temp.addEventListener('change', onChange, { once: true });
			temp.click();
		});
	}

	async function open(options){
		const mode = normalizeMode(options && options.mode);
		const multiple = !!(options && options.multiple);
		if (window.showOpenFilePicker) {
			try{
				const handles = await window.showOpenFilePicker({ multiple, types: buildTypesForMode(mode) });
				const files = await Promise.all(handles.map(h => h.getFile()));
				return filterByMode(files, mode);
			}catch(e){
				return [];
			}
		}
		const files = await openWithTempInput({ multiple, accept: buildAcceptAttr(mode) });
		return filterByMode(files, mode);
	}

	window.MediaPicker = {
		open,
		filterFiles: filterByMode,
		modes: { images: 'images', imagesOrPdf: 'imagesOrPdf', any: 'any' },
		enhanceDropZone(dropZone, { mode = 'any', multiple = true, onFiles } = {}){
			if (!dropZone) return;
			// unify visuals on drag interactions
			dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('dragover'); }, { passive: false });
			dropZone.addEventListener('dragleave', (e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); }, { passive: false });
			dropZone.addEventListener('drop', async (e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); const files = filterByMode(e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [], normalizeMode(mode)); if (files.length && typeof onFiles === 'function') onFiles(files); }, { passive: false });
			dropZone.addEventListener('click', async ()=>{ const files = await open({ mode, multiple }); if (files.length && typeof onFiles === 'function') onFiles(files); });
		}
	};
})();


