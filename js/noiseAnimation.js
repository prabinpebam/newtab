// noise-animation.js
// A generic library for animated noise with ripple, stipple and displacement effects.
// Requires an external Perlin noise library (e.g., from https://cdn.jsdelivr.net/npm/perlin@1.0.0/index.min.js)

class NoiseAnimation {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      // Default options
      const defaultOptions = {
        speed: 0.005,
        resolutionFactor: 0.9,
        animationEnabled: true,
        invertNoise: true,
        enablePerlin: true,
        perlinScale: 0.004,
        perlinBrightness: 0,
        perlinContrast: 3,
        enablePerlin2: true,
        perlin2Scale: 0.009,
        perlin2Brightness: 0,
        perlin2Contrast: 5,
        rippleEnabled: true,
        rippleAmount: 0.2,
        stippleEnabled: true,
        minDistance: 5,
        minDotSize: 0.1,
        maxDotSize: 2,
        brightnessThreshold: 255,
        displacementEnabled: true,
        displacementAmount: 10
      };
      this.options = Object.assign({}, defaultOptions, options);
      
      this.time = 0;
      this.ripples = [];
      
      // Setup offscreen canvases for noise generation and composition
      this.baseOffWidth = canvas.width * this.options.resolutionFactor;
      this.baseOffHeight = canvas.height * this.options.resolutionFactor;
      
      this.offCanvas = document.createElement('canvas');
      this.offCtx = this.offCanvas.getContext('2d');
      
      this.compositeCanvas = document.createElement('canvas');
      this.compositeCanvas.width = canvas.width;
      this.compositeCanvas.height = canvas.height;
      this.compositeCtx = this.compositeCanvas.getContext('2d');
      
      // Displacement canvas for ripple effect
      this.displacementCanvas = document.createElement('canvas');
      this.displacementCanvas.width = this.compositeCanvas.width;
      this.displacementCanvas.height = this.compositeCanvas.height;
      this.dispCtx = this.displacementCanvas.getContext('2d');
      
      // WebGL canvas for applying the ripple effect
      this.rippleCanvas = document.createElement('canvas');
      this.rippleCanvas.width = this.compositeCanvas.width;
      this.rippleCanvas.height = this.compositeCanvas.height;
      this.gl = this.rippleCanvas.getContext('webgl');
      
      // Setup Poisson points for stipple art
      this.stipplePoints = [];
      this.updateOffCanvasSize();
      
      // Initialize WebGL shaders and program for ripple effect
      this.initWebGL();
      
      // Add mousemove listener to create ripples
      this.canvas.addEventListener('mousemove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.ripples.push({ x, y, startTime: performance.now() });
      });
      
      // Bind animate so that we can call it recursively
      this.animationFrameId = null;
      this.animate = this.animate.bind(this);
      this.start();
    }
    
    // Allows updating options at runtime.
    updateOptions(newOptions) {
      Object.assign(this.options, newOptions);
      // If resolution or displacement related options change, update offscreen size
      if (newOptions.resolutionFactor || newOptions.displacementEnabled || newOptions.displacementAmount || newOptions.minDistance) {
        this.updateOffCanvasSize();
      }
    }
    
    extraMargin() {
      return this.options.displacementEnabled ? this.options.displacementAmount * this.options.resolutionFactor : 0;
    }
    
    updateOffCanvasSize() {
      this.baseOffWidth = this.canvas.width * this.options.resolutionFactor;
      this.baseOffHeight = this.canvas.height * this.options.resolutionFactor;
      const extMargin = this.extraMargin();
      this.offCanvas.width = this.baseOffWidth;
      this.offCanvas.height = this.baseOffHeight + extMargin;
      this.stipplePoints = this.generatePoissonPoints(this.offCanvas.width, this.offCanvas.height, this.options.minDistance);
    }
    
    // Poisson Disk Sampling to generate stipple points.
    generatePoissonPoints(width, height, minDist, k = 30) {
      const cellSize = minDist / Math.SQRT2;
      const gridWidth = Math.ceil(width / cellSize);
      const gridHeight = Math.ceil(height / cellSize);
      const grid = new Array(gridWidth * gridHeight).fill(null);
      const points = [];
      const active = [];
      function gridIndex(x, y) { return x + y * gridWidth; }
      function addPoint(pt) {
        points.push(pt);
        active.push(pt);
        const gx = Math.floor(pt.x / cellSize);
        const gy = Math.floor(pt.y / cellSize);
        grid[gridIndex(gx, gy)] = pt;
      }
      addPoint({ x: Math.random() * width, y: Math.random() * height });
      while (active.length) {
        const randIndex = Math.floor(Math.random() * active.length);
        const point = active[randIndex];
        let found = false;
        for (let i = 0; i < k; i++) {
          const angle = Math.random() * 2 * Math.PI;
          const mag = minDist * (1 + Math.random());
          const newX = point.x + Math.cos(angle) * mag;
          const newY = point.y + Math.sin(angle) * mag;
          const newPt = { x: newX, y: newY };
          if (newX < 0 || newX >= width || newY < 0 || newY >= height) continue;
          const gx = Math.floor(newX / cellSize);
          const gy = Math.floor(newY / cellSize);
          let ok = true;
          for (let ix = Math.max(0, gx - 2); ix <= Math.min(gx + 2, gridWidth - 1); ix++) {
            for (let iy = Math.max(0, gy - 2); iy <= Math.min(gy + 2, gridHeight - 1); iy++) {
              const neighbor = grid[gridIndex(ix, iy)];
              if (neighbor) {
                const dx = neighbor.x - newX;
                const dy = neighbor.y - newY;
                if (dx * dx + dy * dy < minDist * minDist) { ok = false; }
              }
            }
          }
          if (ok) { addPoint(newPt); found = true; break; }
        }
        if (!found) { active.splice(randIndex, 1); }
      }
      return points;
    }
    
    // Generates the noise image using two Perlin noise functions.
    generateNoiseImage() {
      const width = this.offCanvas.width;
      const extHeight = this.offCanvas.height;
      const imageData = this.offCtx.createImageData(width, extHeight);
      const data = imageData.data;
      const cx = width / 2;
      const cy = this.baseOffHeight / 2;
      for (let y = 0; y < extHeight; y++) {
        for (let x = 0; x < width; x++) {
          const nx = (x - cx) * this.options.perlinScale;
          const ny = (y - cy) * this.options.perlinScale;
          const n2x = (x - cx) * this.options.perlin2Scale;
          const n2y = (y - cy) * this.options.perlin2Scale;
          let perlinVal, perlin2Val;
          if (this.options.enablePerlin) {
            let val1 = noise.perlin2(nx + this.time, ny + this.time);
            perlinVal = (val1 + 1) * 127.5;
            perlinVal = (perlinVal - 128) * this.options.perlinContrast + 128 + this.options.perlinBrightness;
          } else {
            perlinVal = 127.5;
          }
          if (this.options.enablePerlin2) {
            let val2 = noise.perlin2(n2x - this.time, n2y - this.time);
            perlin2Val = (val2 + 1) * 127.5;
            perlin2Val = (perlin2Val - 128) * this.options.perlin2Contrast + 128 + this.options.perlin2Brightness;
          } else {
            perlin2Val = 127.5;
          }
          if (this.options.invertNoise) {
            perlinVal = 255 - perlinVal;
            perlin2Val = 255 - perlin2Val;
          }
          let combined = (perlinVal + perlin2Val) / 2;
          combined = Math.max(0, Math.min(255, Math.floor(combined)));
          const idx = (y * width + x) * 4;
          data[idx] = combined;
          data[idx+1] = combined;
          data[idx+2] = combined;
          data[idx+3] = 255;
        }
      }
      return imageData;
    }
    
    // Updates the displacement texture by drawing all active ripples.
    updateDisplacementTexture() {
      this.dispCtx.clearRect(0, 0, this.displacementCanvas.width, this.displacementCanvas.height);
      this.dispCtx.globalCompositeOperation = 'lighter';
      const currentTime = performance.now();
      const rippleDuration = 1.5; // seconds
      const rippleSpeed = 150; // pixels per second
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const ripple = this.ripples[i];
        const age = (currentTime - ripple.startTime) / 1000;
        if (age > rippleDuration) {
          this.ripples.splice(i, 1);
          continue;
        }
        const radius = rippleSpeed * age;
        const amplitude = this.options.rippleAmount * (1 - age / rippleDuration);
        const a = Math.min(amplitude, 1.0);
        let grad = this.dispCtx.createRadialGradient(ripple.x, ripple.y, 0, ripple.x, ripple.y, radius);
        grad.addColorStop(0, `rgba(${Math.floor(a * 255)}, ${Math.floor(a * 255)}, ${Math.floor(a * 255)}, 1)`);
        grad.addColorStop(1, 'rgba(0,0,0,1)');
        this.dispCtx.fillStyle = grad;
        this.dispCtx.beginPath();
        this.dispCtx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
        this.dispCtx.fill();
      }
      this.dispCtx.globalCompositeOperation = 'source-over';
    }
    
    // Initializes WebGL for the ripple effect.
    initWebGL() {
      const gl = this.gl;
      // Vertex shader
      const vertexShaderSource = `
        attribute vec2 aPosition;
        attribute vec2 aTexCoord;
        varying vec2 vUv;
        void main() {
          vUv = aTexCoord;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `;
      // Fragment shader
      const fragmentShaderSource = `
        precision mediump float;
        uniform sampler2D uTexture;
        uniform sampler2D uDisplacement;
        uniform vec4 winResolution;
        uniform float rippleAmount;
        varying vec2 vUv;
        float PI = 3.141592653589793238;
        void main() {
          vec2 vUvScreen = gl_FragCoord.xy / winResolution.xy;
          vec4 displacement = texture2D(uDisplacement, vUvScreen);
          float theta = displacement.r * 2.0 * PI;
          vec2 dir = vec2(sin(theta), cos(theta));
          vec2 uv = vUvScreen + dir * displacement.r * rippleAmount;
          vec4 color = texture2D(uTexture, uv);
          gl_FragColor = color;
        }
      `;
      function compileShader(source, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error('Shader compile failed: ' + gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      }
      const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
      const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link failed: ' + gl.getProgramInfoLog(program));
        return;
      }
      this.rippleProgram = program;
      gl.useProgram(this.rippleProgram);
      
      // Full-screen quad
      const quadVertices = new Float32Array([
        -1, -1,  0, 0,
         1, -1,  1, 0,
        -1,  1,  0, 1,
        -1,  1,  0, 1,
         1, -1,  1, 0,
         1,  1,  1, 1,
      ]);
      const quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
      const aPosition = gl.getAttribLocation(this.rippleProgram, 'aPosition');
      const aTexCoord = gl.getAttribLocation(this.rippleProgram, 'aTexCoord');
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aTexCoord);
      gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);
      
      // Get uniform locations
      this.uTextureLoc = gl.getUniformLocation(this.rippleProgram, 'uTexture');
      this.uDisplacementLoc = gl.getUniformLocation(this.rippleProgram, 'uDisplacement');
      this.winResolutionLoc = gl.getUniformLocation(this.rippleProgram, 'winResolution');
      this.rippleAmountLoc = gl.getUniformLocation(this.rippleProgram, 'rippleAmount');
      gl.uniform4f(this.winResolutionLoc, this.rippleCanvas.width, this.rippleCanvas.height, 0, 0);
      
      // Create textures
      this.noiseTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      
      this.displacementTextureGL = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.displacementTextureGL);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    
    // Applies the ripple effect via WebGL using the current noise image and displacement map.
    applyRippleEffect(noiseImageData) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, noiseImageData.width, noiseImageData.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseImageData.data);
      gl.uniform1i(this.uTextureLoc, 0);
      
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.displacementTextureGL);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.displacementCanvas);
      gl.uniform1i(this.uDisplacementLoc, 1);
      
      gl.uniform1f(this.rippleAmountLoc, this.options.rippleAmount);
      
      gl.viewport(0, 0, this.rippleCanvas.width, this.rippleCanvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      const pixels = new Uint8Array(this.rippleCanvas.width * this.rippleCanvas.height * 4);
      gl.readPixels(0, 0, this.rippleCanvas.width, this.rippleCanvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return new ImageData(new Uint8ClampedArray(pixels), this.rippleCanvas.width, this.rippleCanvas.height);
    }
    
    // Draws the stipple (dotted) overlay onto the composite canvas.
    drawStipple(imageData) {
      this.compositeCtx.fillStyle = 'black';
      this.compositeCtx.fillRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
      const scaleX = this.compositeCanvas.width / this.offCanvas.width;
      const scaleY = this.compositeCanvas.height / this.baseOffHeight;
      this.compositeCtx.fillStyle = 'white';
      for (let pt of this.stipplePoints) {
        const brightnessVal = this.sampleBrightness(imageData, pt.x, pt.y);
        if (brightnessVal > this.options.brightnessThreshold) continue;
        const radius = this.options.minDotSize + (1 - brightnessVal / 255) * (this.options.maxDotSize - this.options.minDotSize);
        let drawX = pt.x * scaleX;
        let drawY = pt.y * scaleY;
        if (this.options.displacementEnabled) {
          const disp = (brightnessVal / 255) * this.options.displacementAmount;
          drawY -= disp;
        }
        this.compositeCtx.beginPath();
        this.compositeCtx.arc(drawX, drawY, radius, 0, Math.PI * 2);
        this.compositeCtx.fill();
      }
    }
    
    // Draws the noise image onto the composite canvas without the stipple overlay.
    drawNoise(imageData) {
      this.offCtx.putImageData(imageData, 0, 0);
      this.compositeCtx.clearRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
      this.compositeCtx.drawImage(this.offCanvas, 0, 0, this.offCanvas.width, this.baseOffHeight, 0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
    }
    
    // Helper: Samples the brightness at (x, y) from an ImageData object.
    sampleBrightness(imageData, x, y) {
      const ix = Math.floor(Math.max(0, Math.min(x, imageData.width - 1)));
      const iy = Math.floor(Math.max(0, Math.min(y, imageData.height - 1)));
      return imageData.data[(iy * imageData.width + ix) * 4];
    }
    
    // The main animation loop.
    animate() {
      this.animationFrameId = requestAnimationFrame(this.animate);
      if (this.options.animationEnabled) {
        this.time += this.options.speed;
      }
      let noiseImageData = this.generateNoiseImage();
      if (this.options.rippleEnabled) {
        this.updateDisplacementTexture();
        noiseImageData = this.applyRippleEffect(noiseImageData);
        this.compositeCtx.putImageData(noiseImageData, 0, 0);
      } else {
        this.drawNoise(noiseImageData);
      }
      if (this.options.stippleEnabled) {
        this.drawStipple(noiseImageData);
      }
      this.ctx.drawImage(this.compositeCanvas, 0, 0, this.canvas.width, this.canvas.height);
    }
    
    start() {
      if (!this.animationFrameId) {
        this.animate();
      }
    }
    
    stop() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }
  }
  
  // Attach the class to the global window object so it can be used by other scripts.
  window.NoiseAnimation = NoiseAnimation;
  