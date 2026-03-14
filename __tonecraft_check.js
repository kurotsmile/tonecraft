
    const defaults = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      gamma: 100,
      warmth: 0,
      fade: 0,
      vignette: 0,
      sharpness: 0
    };

    const presets = {
      neutral: { ...defaults },
      vivid: { brightness: 8, contrast: 20, saturation: 30, gamma: 96, warmth: 12, fade: 0, vignette: 8, sharpness: 18 },
      portrait: { brightness: 10, contrast: 8, saturation: 14, gamma: 102, warmth: 10, fade: 6, vignette: 6, sharpness: 8 },
      mono: { brightness: 4, contrast: 28, saturation: -100, gamma: 104, warmth: 0, fade: 10, vignette: 14, sharpness: 12 },
      vintage: { brightness: 6, contrast: -8, saturation: -18, gamma: 108, warmth: 22, fade: 26, vignette: 16, sharpness: 0 },
      cinema: { brightness: -4, contrast: 24, saturation: 10, gamma: 92, warmth: -8, fade: 4, vignette: 22, sharpness: 20 }
    };

    const state = {
      image: null,
      fileName: "",
      rotation: 0,
      flipX: 1,
      flipY: 1,
      zoom: 1,
      compareEnabled: false,
      previewScale: 1,
      baseImageData: null,
      renderFrame: 0,
      renderTimer: 0,
      deferHeavyEffects: false
    };

    const controls = ["brightness", "contrast", "saturation", "gamma", "warmth", "fade", "vignette", "sharpness"].reduce((acc, key) => {
      acc[key] = {
        input: document.getElementById(key),
        output: document.getElementById(key + "Out")
      };
      return acc;
    }, {});

    const elements = {
      uploadZone: document.getElementById("uploadZone"),
      fileInput: document.getElementById("fileInput"),
      loadBadge: document.getElementById("loadBadge"),
      statusText: document.getElementById("statusText"),
      workspaceTitle: document.getElementById("workspaceTitle"),
      workspaceSubtitle: document.getElementById("workspaceSubtitle"),
      canvasStage: document.getElementById("canvasStage"),
      canvasStack: document.getElementById("canvasStack"),
      baseCanvas: document.getElementById("baseCanvas"),
      editCanvas: document.getElementById("editCanvas"),
      compareCurtain: document.getElementById("compareCurtain"),
      compareRange: document.getElementById("compareRange"),
      compareOut: document.getElementById("compareOut"),
      toggleCompareBtn: document.getElementById("toggleCompareBtn"),
      fitBtn: document.getElementById("fitBtn"),
      zoomOutBtn: document.getElementById("zoomOutBtn"),
      zoomInBtn: document.getElementById("zoomInBtn"),
      resetBtn: document.getElementById("resetBtn"),
      rotateLeftBtn: document.getElementById("rotateLeftBtn"),
      rotateRightBtn: document.getElementById("rotateRightBtn"),
      flipHBtn: document.getElementById("flipHBtn"),
      flipVBtn: document.getElementById("flipVBtn"),
      exportFormat: document.getElementById("exportFormat"),
      quality: document.getElementById("quality"),
      exportBadge: document.getElementById("exportBadge"),
      downloadBtn: document.getElementById("downloadBtn"),
      infoName: document.getElementById("infoName"),
      infoSize: document.getElementById("infoSize"),
      infoZoom: document.getElementById("infoZoom"),
      infoTransform: document.getElementById("infoTransform")
    };

    const baseCtx = elements.baseCanvas.getContext("2d", { willReadFrequently: true });
    const editCtx = elements.editCanvas.getContext("2d", { willReadFrequently: true });

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function controlValue(name) {
      return Number(controls[name].input.value);
    }

    function updateOutputs() {
      Object.entries(controls).forEach(([name, pair]) => {
        const value = Number(pair.input.value);
        pair.output.value = name === "gamma" ? (value / 100).toFixed(2) : String(value);
      });

      elements.compareOut.value = elements.compareRange.value + "%";
      elements.exportBadge.textContent = elements.exportFormat.value.replace("image/", "").toUpperCase() + " " + clamp(Number(elements.quality.value) || 92, 10, 100) + "%";
      elements.infoZoom.textContent = Math.round(state.zoom * 100) + "%";

      let transformText = state.rotation + " deg";
      if (state.flipX === -1) transformText += " | flipX";
      if (state.flipY === -1) transformText += state.flipX === -1 ? " flipY" : " | flipY";
      elements.infoTransform.textContent = transformText;
    }

    function setStatus(text, badge) {
      elements.statusText.textContent = text;
      elements.loadBadge.textContent = badge;
    }

    function setControls(values) {
      Object.entries(values).forEach(([key, value]) => {
        controls[key].input.value = value;
      });
      updateOutputs();
    }

    function getDimensions(fullSize) {
      if (!state.image) {
        return { width: 1, height: 1 };
      }
      const scale = fullSize ? 1 : state.previewScale;
      const rotated = Math.abs(state.rotation) % 180 === 90;
      return {
        width: Math.max(1, Math.round((rotated ? state.image.height : state.image.width) * scale)),
        height: Math.max(1, Math.round((rotated ? state.image.width : state.image.height) * scale))
      };
    }

    function sizeCanvases() {
      const { width, height } = getDimensions(false);
      [elements.baseCanvas, elements.editCanvas].forEach((canvas) => {
        canvas.width = width;
        canvas.height = height;
      });
      elements.canvasStack.style.width = width + "px";
      elements.canvasStack.style.height = height + "px";
    }

    function renderImageToContext(targetCtx, width, height, sourceWidth, sourceHeight) {
      targetCtx.clearRect(0, 0, width, height);
      targetCtx.save();
      targetCtx.translate(width / 2, height / 2);
      targetCtx.rotate(state.rotation * Math.PI / 180);
      targetCtx.scale(state.flipX, state.flipY);
      targetCtx.drawImage(state.image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
      targetCtx.restore();
    }

    function renderBaseImage() {
      if (!state.image) {
        return;
      }

      const { width, height } = getDimensions(false);
      sizeCanvases();
      renderImageToContext(baseCtx, width, height, Math.round(state.image.width * state.previewScale), Math.round(state.image.height * state.previewScale));
      state.baseImageData = baseCtx.getImageData(0, 0, width, height);

      elements.infoSize.textContent = state.image.width + " x " + state.image.height;
    }

    function applySharpness(imageData, amount) {
      if (amount <= 0) {
        return imageData;
      }

      const { width, height, data } = imageData;
      const source = new Uint8ClampedArray(data);
      const strength = amount / 100;

      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const index = (y * width + x) * 4;
          for (let c = 0; c < 3; c += 1) {
            const sharpened =
              source[index + c] * 5 -
              source[index - 4 + c] -
              source[index + 4 + c] -
              source[index - width * 4 + c] -
              source[index + width * 4 + c];
            data[index + c] = clamp(source[index + c] + sharpened * strength * 0.35, 0, 255);
          }
        }
      }

      return imageData;
    }

    function syncCompare() {
      const split = clamp(Number(elements.compareRange.value) || 50, 0, 100);
      elements.compareOut.value = split + "%";

      if (!state.image || !state.compareEnabled) {
        elements.baseCanvas.style.display = "none";
        elements.baseCanvas.style.clipPath = "none";
        elements.compareCurtain.style.display = "none";
        return;
      }

      elements.baseCanvas.style.display = "block";
      elements.baseCanvas.style.clipPath = "inset(0 " + (100 - split) + "% 0 0)";
      elements.compareCurtain.style.display = "block";
      elements.compareCurtain.style.left = split + "%";
    }

    function applyAdjustments(imageData, skipSharpness) {
      const { width, height } = imageData;
      const data = imageData.data;
      const brightness = controlValue("brightness");
      const contrast = (controlValue("contrast") + 100) / 100;
      const saturation = (controlValue("saturation") + 100) / 100;
      const gamma = clamp(controlValue("gamma") / 100, 0.4, 2.2);
      const warmth = controlValue("warmth");
      const fade = controlValue("fade") / 100;
      const vignette = controlValue("vignette") / 100;
      const centerX = width / 2;
      const centerY = height / 2;
      const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY) || 1;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          r = (r - 128) * contrast + 128 + brightness;
          g = (g - 128) * contrast + 128 + brightness;
          b = (b - 128) * contrast + 128 + brightness;

          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = gray + (r - gray) * saturation;
          g = gray + (g - gray) * saturation;
          b = gray + (b - gray) * saturation;

          r += warmth * 0.6;
          g += warmth * 0.15;
          b -= warmth * 0.55;

          if (fade > 0) {
            r = r * (1 - fade) + 235 * fade;
            g = g * (1 - fade) + 228 * fade;
            b = b * (1 - fade) + 220 * fade;
          }

          const distance = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
          const vignetteFactor = 1 - Math.pow(distance / maxDistance, 1.7) * vignette;

          r = 255 * Math.pow(clamp(r, 0, 255) / 255, 1 / gamma) * vignetteFactor;
          g = 255 * Math.pow(clamp(g, 0, 255) / 255, 1 / gamma) * vignetteFactor;
          b = 255 * Math.pow(clamp(b, 0, 255) / 255, 1 / gamma) * vignetteFactor;

          data[i] = clamp(r, 0, 255);
          data[i + 1] = clamp(g, 0, 255);
          data[i + 2] = clamp(b, 0, 255);
        }
      }

      if (!skipSharpness) {
        applySharpness(imageData, controlValue("sharpness"));
      }

      return imageData;
    }

    function drawEdited() {
      if (!state.image || !state.baseImageData) {
        return;
      }

      const { width, height } = getDimensions(false);
      const imageData = new ImageData(new Uint8ClampedArray(state.baseImageData.data), width, height);
      applyAdjustments(imageData, state.deferHeavyEffects);

      editCtx.putImageData(imageData, 0, 0);
      syncCompare();
    }

    function scheduleDraw(isInteractive) {
      if (!state.image) {
        return;
      }

      state.deferHeavyEffects = Boolean(isInteractive);

      if (state.renderFrame) {
        cancelAnimationFrame(state.renderFrame);
      }

      state.renderFrame = requestAnimationFrame(() => {
        state.renderFrame = 0;
        drawEdited();
      });

      if (state.renderTimer) {
        clearTimeout(state.renderTimer);
      }

      if (isInteractive) {
        state.renderTimer = setTimeout(() => {
          state.deferHeavyEffects = false;
          drawEdited();
          state.renderTimer = 0;
        }, 120);
      }
    }

    function applyZoom(value) {
      state.zoom = clamp(value, 0.2, 3);
      elements.canvasStack.style.transform = "scale(" + state.zoom + ")";
      updateOutputs();
    }

    function fitToView() {
      if (!state.image) {
        return;
      }

      const { width, height } = getDimensions(false);
      const stageWidth = elements.canvasStage.clientWidth - 32;
      const stageHeight = elements.canvasStage.clientHeight - 32;
      if (stageWidth <= 0 || stageHeight <= 0) {
        return;
      }
      applyZoom(Math.min(stageWidth / width, stageHeight / height, 1));
    }

    function updateWorkspaceMeta() {
      if (!state.image) {
        elements.canvasStage.classList.add("is-empty");
        elements.workspaceTitle.textContent = "ToneCraft preview studio";
        elements.workspaceSubtitle.textContent = "Load an image to activate comparison, transforms, zoom, and export tools.";
        elements.infoName.textContent = "-";
        elements.infoSize.textContent = "-";
        return;
      }

      elements.canvasStage.classList.remove("is-empty");
      elements.workspaceTitle.textContent = state.fileName;
      elements.workspaceSubtitle.textContent = "Use presets for fast looks, then fine-tune sliders and export your final frame.";
      elements.infoName.textContent = state.fileName;
    }

    async function loadImage(file) {
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        setStatus("That file is not an image.", "Error");
        return;
      }

      setStatus("Loading image...", "Loading");

      try {
        const image = await new Promise((resolve, reject) => {
          const nextImage = new Image();
          const reader = new FileReader();

          nextImage.onload = () => resolve(nextImage);
          nextImage.onerror = () => reject(new Error("image-load-failed"));
          reader.onerror = () => reject(new Error("file-read-failed"));
          reader.onload = () => {
            nextImage.src = reader.result;
          };
          reader.readAsDataURL(file);
        });

        state.image = image;
        state.fileName = file.name || "clipboard-image";
        state.rotation = 0;
        state.flipX = 1;
        state.flipY = 1;
        state.zoom = 1;
        state.previewScale = Math.min(1, 1600 / Math.max(image.width, image.height));
        state.baseImageData = null;

        setControls(defaults);
        renderBaseImage();
        drawEdited();
        updateWorkspaceMeta();
        updateOutputs();
        syncCompare();
        elements.fileInput.value = "";
        setStatus("Loaded " + state.fileName + ".", "Loaded");
      } catch (error) {
        setStatus("Unable to load this image.", "Error");
      }
    }

    function exportImage() {
      if (!state.image) {
        setStatus("Load an image before exporting.", "Idle");
        return;
      }

      const mimeType = elements.exportFormat.value;
      const quality = clamp(Number(elements.quality.value) || 92, 10, 100) / 100;
      const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const { width, height } = getDimensions(true);
      const exportCanvas = document.createElement("canvas");
      const exportCtx = exportCanvas.getContext("2d", { willReadFrequently: true });
      exportCanvas.width = width;
      exportCanvas.height = height;
      renderImageToContext(exportCtx, width, height, state.image.width, state.image.height);
      const exportData = exportCtx.getImageData(0, 0, width, height);
      applyAdjustments(exportData, false);
      exportCtx.putImageData(exportData, 0, 0);
      const link = document.createElement("a");
      link.href = exportCanvas.toDataURL(mimeType, quality);
      link.download = "tonecraft-export." + extension;
      link.click();
      setStatus("Exported edited image.", "Saved");
    }

    Object.values(controls).forEach((pair) => {
      pair.input.addEventListener("input", () => {
        updateOutputs();
        scheduleDraw(true);
      });
      pair.input.addEventListener("change", () => {
        state.deferHeavyEffects = false;
        drawEdited();
      });
    });

    document.querySelectorAll(".preset-btn").forEach((button) => {
      button.addEventListener("click", () => {
        setControls(presets[button.dataset.preset]);
        drawEdited();
        setStatus("Preset applied: " + button.dataset.preset + ".", "Preset");
      });
    });

    elements.fileInput.addEventListener("change", (event) => {
      loadImage(event.target.files[0]);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      elements.uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.uploadZone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      elements.uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.uploadZone.classList.remove("dragover");
      });
    });

    elements.uploadZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      loadImage(file);
    });

    document.addEventListener("paste", (event) => {
      const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (imageItem) {
        loadImage(imageItem.getAsFile());
      }
    });

    elements.compareRange.addEventListener("input", syncCompare);
    elements.exportFormat.addEventListener("change", updateOutputs);
    elements.quality.addEventListener("input", updateOutputs);
    elements.downloadBtn.addEventListener("click", exportImage);

    elements.resetBtn.addEventListener("click", () => {
      setControls(defaults);
      state.rotation = 0;
      state.flipX = 1;
      state.flipY = 1;
      if (state.image) {
        renderBaseImage();
        drawEdited();
      }
      updateOutputs();
      setStatus("All settings were reset.", "Reset");
    });

    elements.toggleCompareBtn.addEventListener("click", () => {
      state.compareEnabled = !state.compareEnabled;
      elements.toggleCompareBtn.textContent = state.compareEnabled ? "Hide compare" : "Toggle compare";
      syncCompare();
    });

    elements.fitBtn.addEventListener("click", fitToView);
    elements.zoomOutBtn.addEventListener("click", () => applyZoom(state.zoom - 0.1));
    elements.zoomInBtn.addEventListener("click", () => applyZoom(state.zoom + 0.1));

    elements.rotateLeftBtn.addEventListener("click", () => {
      if (!state.image) {
        return;
      }
      state.rotation = (state.rotation - 90 + 360) % 360;
      renderBaseImage();
      drawEdited();
      updateOutputs();
    });

    elements.rotateRightBtn.addEventListener("click", () => {
      if (!state.image) {
        return;
      }
      state.rotation = (state.rotation + 90) % 360;
      renderBaseImage();
      drawEdited();
      updateOutputs();
    });

    elements.flipHBtn.addEventListener("click", () => {
      if (!state.image) {
        return;
      }
      state.flipX *= -1;
      renderBaseImage();
      drawEdited();
      updateOutputs();
    });

    elements.flipVBtn.addEventListener("click", () => {
      if (!state.image) {
        return;
      }
      state.flipY *= -1;
      renderBaseImage();
      drawEdited();
      updateOutputs();
    });

    updateOutputs();
    updateWorkspaceMeta();
    syncCompare();
    setStatus("Waiting for an image.", "No image");
  
