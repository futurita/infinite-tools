;(function(){
  'use strict';

  function onReady(cb){ if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', cb, { once:true }); } else { cb(); } }

  onReady(function(){
    var input = document.getElementById('fileInput');
    var drop = document.getElementById('dropzone');
    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    var feather = document.getElementById('feather');
    var tolerance = document.getElementById('tolerance');
    var downloadPng = document.getElementById('downloadPng');

    var originalImageBitmap = null;
    var currentOutput = null;

    function setCanvasSize(w, h){
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
    }

    function drawImageToCanvas(imageBitmap){
      if (!imageBitmap) return;
      setCanvasSize(imageBitmap.width, imageBitmap.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    }

    function colorDistance(c1, c2){
      var dr = c1[0] - c2[0];
      var dg = c1[1] - c2[1];
      var db = c1[2] - c2[2];
      return Math.sqrt(dr*dr + dg*dg + db*db);
    }

    function sampleCorners(data, w, h){
      function get(x, y){
        var i = (y*w + x) * 4;
        return [data[i], data[i+1], data[i+2]];
      }
      var p = 5;
      var samples = [
        get(0,0), get(p,0), get(0,p),
        get(w-1,0), get(w-1-p,0), get(w-1,p),
        get(0,h-1), get(p,h-1), get(0,h-1-p),
        get(w-1,h-1), get(w-1-p,h-1), get(w-1,h-1-p)
      ];
      var avg = samples.reduce(function(a,c){ return [a[0]+c[0], a[1]+c[1], a[2]+c[2]]; }, [0,0,0]).map(function(v){ return v/samples.length; });
      return avg;
    }

    function applyBackgroundRemoval(){
      var w = canvas.width; var h = canvas.height;
      if (!w || !h) return;
      var imgData = ctx.getImageData(0, 0, w, h);
      var data = imgData.data;
      var bg = sampleCorners(data, w, h);
      var tol = parseInt(tolerance.value, 10) * 2.55; // scale 0-255
      var soft = parseInt(feather.value, 10);

      for (var y=0; y<h; y++){
        for (var x=0; x<w; x++){
          var i = (y*w + x) * 4;
          var d = colorDistance([data[i], data[i+1], data[i+2]], bg);
          var alpha = d <= tol ? 0 : 255;
          data[i+3] = alpha;
        }
      }

      if (soft > 0){
        // feather edges by blurring alpha
        var alphaArr = new Uint8ClampedArray(w*h);
        for (var k=0; k<w*h; k++) alphaArr[k] = data[k*4+3];
        var radius = Math.max(1, Math.round(soft/4));
        var temp = new Uint8ClampedArray(alphaArr.length);
        // horizontal blur
        for (var yy=0; yy<h; yy++){
          var sum = 0; var count = 0;
          for (var xx=0; xx<w+radius; xx++){
            if (xx < w) { sum += alphaArr[yy*w + xx]; count++; }
            if (xx - radius >= 0) { temp[yy*w + (xx - radius)] = Math.round(sum / count); sum -= alphaArr[yy*w + (xx - radius)]; count--; }
          }
        }
        // vertical blur
        for (var xxx=0; xxx<w; xxx++){
          var sum2 = 0; var count2 = 0;
          for (var yyy=0; yyy<h+radius; yyy++){
            if (yyy < h) { sum2 += temp[yyy*w + xxx]; count2++; }
            if (yyy - radius >= 0) { var idx = (yyy - radius)*w + xxx; alphaArr[idx] = Math.round(sum2 / count2); sum2 -= temp[idx]; count2--; }
          }
        }
        for (var m=0; m<w*h; m++) data[m*4+3] = alphaArr[m];
      }

      ctx.putImageData(imgData, 0, 0);
    }

    async function handleFile(file){
      if (!file) return;
      try {
        var blob = file instanceof Blob ? file : new Blob([file]);
        var bitmap = await createImageBitmap(blob);
        originalImageBitmap = bitmap;
        drawImageToCanvas(bitmap);
        applyBackgroundRemoval();
        currentOutput = await new Promise(function(resolve){ canvas.toBlob(resolve, 'image/png'); });
        if (input) input.value = '';
      } catch (err){
        console.error(err);
        alert('Unable to process image. Try a different image.');
        if (input) input.value = '';
      }
    }

    function downloadBlob(blob, filename){
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    }

    // Wire up controls
    if (downloadPng){
      downloadPng.addEventListener('click', async function(){
        if (!currentOutput) currentOutput = await new Promise(function(resolve){ canvas.toBlob(resolve, 'image/png'); });
        if (currentOutput) downloadBlob(currentOutput, 'removed-background.png');
      });
    }

    ['input','change'].forEach(function(evt){
      if (tolerance){ tolerance.addEventListener(evt, function(){ if (originalImageBitmap){ drawImageToCanvas(originalImageBitmap); applyBackgroundRemoval(); currentOutput=null; } }); }
      if (feather){ feather.addEventListener(evt, function(){ if (originalImageBitmap){ drawImageToCanvas(originalImageBitmap); applyBackgroundRemoval(); currentOutput=null; } }); }
    });

    // Media selection (safe, unified)
    if (window.MediaPicker && drop){
      window.MediaPicker.enhanceDropZone(drop, {
        mode: window.MediaPicker.modes.images,
        multiple: false,
        onFiles: function(files){ if (files && files[0]) handleFile(files[0]); }
      });
    } else if (drop){
      // Fallback native DnD
      drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.classList.add('dragover'); });
      drop.addEventListener('dragleave', function(){ drop.classList.remove('dragover'); });
      drop.addEventListener('drop', function(e){ e.preventDefault(); drop.classList.remove('dragover'); var fs = (e.dataTransfer && e.dataTransfer.files) ? Array.from(e.dataTransfer.files) : []; if (fs.length) handleFile(fs[0]); });
      drop.addEventListener('click', function(e){ var inFileButtonArea = e.target && (e.target.id === 'fileInput' || (e.target.closest && e.target.closest('.filewrap'))); if (!inFileButtonArea && input) input.click(); });
    }

    if (input){
      input.addEventListener('change', function(){ handleFile(input.files && input.files[0]); });
      input.addEventListener('click', function(e){ e.stopPropagation(); });
    }

    // Paste support
    window.addEventListener('paste', function(e){
      var dt = e.clipboardData; if (!dt) return;
      var items = Array.from(dt.items || []);
      var file = items.map(function(it){ return it.getAsFile && it.getAsFile(); }).find(function(f){ return f && f.type && f.type.startsWith('image/'); });
      if (file) { e.preventDefault(); handleFile(file); }
    });
  });
})();


