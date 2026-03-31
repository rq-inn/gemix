import { decodeAudioFile, clampTrimRange, createTrimmedPreviewUrl, drawWaveform } from "./audio.js?v=pwa4";
import { detectInitialLanguageNumber, loadLanguages } from "./language.js?v=pwa4";
import { getMessage, loadMessages } from "./messages.js?v=pwa4";
import { createState } from "./state.js?v=pwa4";
import { renderApp, escapeHtml } from "./ui/screens.js?v=pwa4";
import { ensureFfmpeg, generateMp4 } from "./video-pwa5.js?v=pwa5";

let ffmpegWarmupPromise = null;
let previewController = null;

export async function bootApp(root) {
  const [languages, messages] = await Promise.all([loadLanguages(), loadMessages()]);
  const stateStore = createState();
  const initialLanguage = detectInitialLanguageNumber(languages);

  stateStore.set({
    languages,
    messages,
    languageNumber: initialLanguage,
    screen: "home"
  });

  stateStore.subscribe((state) => {
    render(root, stateStore, state);
  });

  render(root, stateStore, stateStore.get());
}

function render(root, stateStore, state) {
  const t = (key) => getMessage(state.messages, key, state.languageNumber);
  const statusKey = state.errorKey || state.statusKey;
  const statusClass = state.errorKey ? "status is-error" : state.statusKey === "download_ready" ? "status is-success" : "status";
  const languageOptions = state.languages.map((language) => `
    <option value="${escapeHtml(language.Number)}" ${language.Number === state.languageNumber ? "selected" : ""}>
      ${escapeHtml(language.language)}
    </option>
  `).join("");

  let screenHtml = "";

  if (state.screen === "home") {
    screenHtml = `
      <section class="hero">
        <div>
          <h1 class="hero-title">${escapeHtml(t("app_name"))}</h1>
          <p class="hero-copy">${escapeHtml(t("app_description"))}</p>
        </div>
        <div class="actions">
          <button class="button-primary" data-action="go-audio">${escapeHtml(t("start"))}</button>
        </div>
      </section>
    `;
  }

  if (state.screen === "audio") {
    screenHtml = `
      <section class="waveform-panel">
        <div>
          <h2 class="screen-title">${escapeHtml(t("screen_audio_select_title"))}</h2>
        </div>
        <div class="dropzone" data-dropzone="audio">
          <div>${escapeHtml(t("drop_mp3"))}</div>
          <label class="button-secondary">
            ${escapeHtml(t("choose_mp3"))}
            <input id="audioInput" type="file" accept=".mp3,audio/mpeg">
          </label>
          <div class="file-name">${escapeHtml(state.audioFileName || "-")}</div>
        </div>
        <div class="${statusClass}">${escapeHtml(statusKey ? t(statusKey) : t(state.audioFile ? "audio_confirm" : "audio_waiting"))}</div>
        ${state.audioFile ? `
          <div class="dual-actions">
            <button class="button-primary" data-action="confirm-audio">${escapeHtml(t("yes"))}</button>
            <button class="button-secondary" data-action="reject-audio">${escapeHtml(t("no"))}</button>
            <button class="button-secondary" data-action="home">${escapeHtml(t("back"))}</button>
          </div>
        ` : `
          <div class="dual-actions">
            <button class="button-secondary" data-action="home">${escapeHtml(t("back"))}</button>
            <button class="button-primary" data-action="confirm-audio" disabled>${escapeHtml(t("next"))}</button>
          </div>
        `}
      </section>
    `;
  }

  if (state.screen === "trim") {
    screenHtml = `
      <section class="waveform-panel">
        <div>
          <h2 class="screen-title">${escapeHtml(t("screen_audio_trim_title"))}</h2>
          <p class="screen-copy">${escapeHtml(t("audio_range_help"))}</p>
        </div>
        <canvas class="waveform-canvas" id="trimWaveform" width="880" height="220"></canvas>
        <div class="slider-grid">
          <label class="slider-row">
            <span>${escapeHtml(t("start_time"))}</span>
            <input id="trimStart" type="range" min="0" max="${state.audioDuration}" step="0.01" value="${state.trimStart}">
          </label>
          <label class="slider-row">
            <span>${escapeHtml(t("end_time"))}</span>
            <input id="trimEnd" type="range" min="0.01" max="${state.audioDuration}" step="0.01" value="${state.trimEnd}">
          </label>
        </div>
        <div class="time-values">
          <span>${escapeHtml(t("start_time"))}: ${formatTime(state.trimStart)}</span>
          <span>${escapeHtml(t("end_time"))}: ${formatTime(state.trimEnd)}</span>
        </div>
        <div class="${statusClass}">${escapeHtml(statusKey ? t(statusKey) : t("state_ready_trim"))}</div>
        <div class="triple-actions">
          <button class="button-secondary" data-action="preview">${escapeHtml(t("preview"))}</button>
          <button class="button-toggle ${state.fadeIn ? "is-active" : ""}" data-action="toggle-fade-in">${escapeHtml(t("fade_in"))}</button>
          <button class="button-toggle ${state.fadeOut ? "is-active" : ""}" data-action="toggle-fade-out">${escapeHtml(t("fade_out"))}</button>
        </div>
        <div class="dual-actions">
          <button class="button-primary" data-action="adopt-trim">${escapeHtml(t("adopt"))}</button>
          <button class="button-secondary" data-action="return-audio">${escapeHtml(t("return_to_select"))}</button>
        </div>
      </section>
    `;
  }

  if (state.screen === "image") {
    screenHtml = `
      <section class="waveform-panel">
        <div>
          <h2 class="screen-title">${escapeHtml(t("screen_image_select_title"))}</h2>
          <p class="screen-copy">${escapeHtml(t("image_help"))}</p>
        </div>
        <div class="preview-grid">
          <div class="dropzone" data-dropzone="image">
            <div>${escapeHtml(t("drop_image"))}</div>
            <label class="button-secondary">
              ${escapeHtml(t("choose_image"))}
              <input id="imageInput" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png">
            </label>
            <div class="file-name">${escapeHtml(state.imageFileName || "-")}</div>
          </div>
          <div>
            ${state.imageDataUrl ? `<img class="image-preview" src="${escapeHtml(state.imageDataUrl)}" alt="">` : `<div class="image-preview"></div>`}
          </div>
        </div>
        <div class="${statusClass}">${escapeHtml(statusKey ? t(statusKey) : t(state.imageFile ? "image_confirm" : "image_waiting"))}</div>
        <div class="dual-actions">
          <button class="button-secondary" data-action="back-trim">${escapeHtml(t("back"))}</button>
          <button class="button-primary" data-action="confirm-image" ${state.imageFile ? "" : "disabled"}>${escapeHtml(t("yes"))}</button>
          <button class="button-secondary" data-action="reject-image" ${state.imageFile ? "" : "disabled"}>${escapeHtml(t("no"))}</button>
        </div>
      </section>
    `;
  }

  if (state.screen === "final") {
    screenHtml = `
      <section class="settings-grid">
        <div>
          <h2 class="screen-title">${escapeHtml(t("screen_final_title"))}</h2>
          <p class="screen-copy">${escapeHtml(t("final_help"))}</p>
        </div>
        <label class="field">
          <span>${escapeHtml(t("title_label"))}</span>
          <input id="titleInput" type="text" value="${escapeHtml(state.title)}" placeholder="${escapeHtml(t("title_placeholder"))}">
        </label>
        <label class="checkbox-row">
          <input id="waveformToggle" type="checkbox" ${state.showWaveform ? "checked" : ""}>
          <span>${escapeHtml(t("waveform_toggle"))}</span>
        </label>
        <div class="${statusClass}">${escapeHtml(statusKey ? t(statusKey) : t("state_ready_final"))}</div>
        <div class="dual-actions">
          <button class="button-primary" data-action="generate" ${state.generating ? "disabled" : ""}>${escapeHtml(t("generate"))}</button>
          <button class="button-secondary" data-action="back-image" ${state.generating ? "disabled" : ""}>${escapeHtml(t("back"))}</button>
        </div>
      </section>
    `;
  }

  renderApp(root, {
    messages: {
      language_label: t("language_label")
    },
    languageOptions,
    screenHtml,
    showLogo: true
  });

  bindEvents(root, stateStore, state);

  if (state.screen === "trim") {
    const canvas = root.querySelector("#trimWaveform");
    if (canvas) {
      drawWaveform(canvas, state.audioBuffer, state.trimStart, state.trimEnd);
    }
  } else {
    stopPreview(root, state);
  }
}

function bindEvents(root, stateStore, state) {
  root.querySelector("#languageSelect")?.addEventListener("change", (event) => {
    stateStore.set({ languageNumber: event.target.value });
  });

  root.querySelector("[data-action='go-audio']")?.addEventListener("click", () => {
    stateStore.set({ screen: "audio", statusKey: "audio_waiting", errorKey: "" });
  });

  root.querySelector("[data-action='home']")?.addEventListener("click", () => {
    stateStore.set({ screen: "home", statusKey: "", errorKey: "" });
  });

  root.querySelector("[data-action='confirm-audio']")?.addEventListener("click", () => {
    if (!state.audioBuffer) {
      stateStore.set({ errorKey: "error_missing_audio", statusKey: "" });
      return;
    }
    stateStore.set({ screen: "trim", statusKey: "state_ready_trim", errorKey: "" });
  });

  root.querySelector("[data-action='reject-audio']")?.addEventListener("click", () => {
    stateStore.resetAudioSelection();
    stateStore.set({ screen: "audio", statusKey: "audio_waiting", errorKey: "" });
  });

  root.querySelector("[data-action='preview']")?.addEventListener("click", async () => {
    try {
      await startPreview(root, state);
    } catch (error) {
      console.error(error);
      stateStore.set({ errorKey: "error_preview", statusKey: "" });
    }
  });

  root.querySelector("[data-action='toggle-fade-in']")?.addEventListener("click", () => {
    stateStore.set({ fadeIn: !state.fadeIn, errorKey: "", statusKey: "state_ready_trim" });
  });

  root.querySelector("[data-action='toggle-fade-out']")?.addEventListener("click", () => {
    stateStore.set({ fadeOut: !state.fadeOut, errorKey: "", statusKey: "state_ready_trim" });
  });

  root.querySelector("[data-action='adopt-trim']")?.addEventListener("click", () => {
    stateStore.set({ screen: "image", statusKey: "image_waiting", errorKey: "" });
  });

  root.querySelector("[data-action='return-audio']")?.addEventListener("click", () => {
    stateStore.set({ screen: "audio", statusKey: state.audioFile ? "audio_confirm" : "audio_waiting", errorKey: "" });
  });

  root.querySelector("[data-action='back-trim']")?.addEventListener("click", () => {
    stateStore.set({ screen: "trim", statusKey: "state_ready_trim", errorKey: "" });
  });

  root.querySelector("[data-action='confirm-image']")?.addEventListener("click", () => {
    if (!state.imageFile) {
      stateStore.set({ errorKey: "error_missing_image", statusKey: "" });
      return;
    }
    stateStore.set({ screen: "final", statusKey: "state_ready_final", errorKey: "" });
    warmupFfmpeg(stateStore);
  });

  root.querySelector("[data-action='reject-image']")?.addEventListener("click", () => {
    stateStore.resetImageSelection();
    stateStore.set({ screen: "image", statusKey: "image_waiting", errorKey: "" });
  });

  root.querySelector("[data-action='back-image']")?.addEventListener("click", () => {
    stateStore.set({ screen: "image", statusKey: state.imageFile ? "image_confirm" : "image_waiting", errorKey: "" });
  });

  root.querySelector("[data-action='generate']")?.addEventListener("click", async () => {
    syncFinalInputs(root, stateStore);
    stateStore.set({ generating: true, statusKey: "loading_engine", errorKey: "" });
    try {
      await (ffmpegWarmupPromise || ensureFfmpeg()).catch((error) => {
        console.error(error);
        throw new Error("ffmpeg-load");
      });

      const currentState = stateStore.get();
      const blob = await generateMp4({
        audioBuffer: currentState.audioBuffer,
        trimStart: currentState.trimStart,
        trimEnd: currentState.trimEnd,
        fadeIn: currentState.fadeIn,
        fadeOut: currentState.fadeOut,
        imageDataUrl: currentState.imageDataUrl,
        title: currentState.title.trim(),
        showWaveform: currentState.showWaveform,
        onPhase: (phaseKey) => stateStore.set({ statusKey: phaseKey, errorKey: "", generating: true })
      });

      const safeTitle = (currentState.title || "gemix").trim().replace(/[\\/:*?"<>|]+/g, "_") || "gemix";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeTitle}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      stateStore.set({ generating: false, statusKey: "download_ready", errorKey: "" });
      setTimeout(() => {
        stateStore.resetAfterDownload();
      }, 500);
    } catch (error) {
      console.error(error);
      stateStore.set({
        generating: false,
        errorKey: error.message === "ffmpeg-load"
          ? "error_ffmpeg"
          : error.message === "recording-unsupported"
            ? "error_recording"
            : "error_generate",
        statusKey: ""
      });
    }
  });

  root.querySelector("#audioInput")?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      handleAudioFile(file, stateStore);
    }
  });

  root.querySelector("#imageInput")?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      handleImageFile(file, stateStore);
    }
  });

  root.querySelector("#trimStart")?.addEventListener("input", (event) => {
    updateTrimRange(stateStore, Number(event.target.value), state.trimEnd, state.audioDuration);
  });

  root.querySelector("#trimEnd")?.addEventListener("input", (event) => {
    updateTrimRange(stateStore, state.trimStart, Number(event.target.value), state.audioDuration);
  });

  root.querySelector("#titleInput")?.addEventListener("input", (event) => {
    stateStore.get().title = event.target.value;
  });

  root.querySelector("#waveformToggle")?.addEventListener("change", (event) => {
    stateStore.set({ showWaveform: event.target.checked });
  });

  attachDropzone(root.querySelector("[data-dropzone='audio']"), async (file) => {
    await handleAudioFile(file, stateStore);
  });

  attachDropzone(root.querySelector("[data-dropzone='image']"), async (file) => {
    await handleImageFile(file, stateStore);
  });
}

async function handleAudioFile(file, stateStore) {
  if (!/\.mp3$/i.test(file.name) && file.type !== "audio/mpeg") {
    stateStore.set({ errorKey: "error_invalid_audio", statusKey: "" });
    return;
  }

  try {
    const audioBuffer = await decodeAudioFile(file);
    stateStore.set({
      audioFile: file,
      audioFileName: file.name,
      audioBuffer,
      audioDuration: audioBuffer.duration,
      trimStart: 0,
      trimEnd: audioBuffer.duration,
      errorKey: "",
      statusKey: "audio_confirm"
    });
  } catch (error) {
    console.error(error);
    stateStore.set({ errorKey: "error_audio_load", statusKey: "" });
  }
}

async function handleImageFile(file, stateStore) {
  if (!/\.(jpe?g|png)$/i.test(file.name) && !["image/jpeg", "image/png"].includes(file.type)) {
    stateStore.set({ errorKey: "error_invalid_image", statusKey: "" });
    return;
  }

  try {
    const dataUrl = await readAsDataUrl(file);
    stateStore.set({
      imageFile: file,
      imageFileName: file.name,
      imageDataUrl: dataUrl,
      errorKey: "",
      statusKey: "image_confirm"
    });
  } catch (error) {
    console.error(error);
    stateStore.set({ errorKey: "error_image_load", statusKey: "" });
  }
}

function updateTrimRange(stateStore, start, end, duration) {
  const range = clampTrimRange(start, end, duration);
  stateStore.set({
    trimStart: range.start,
    trimEnd: range.end,
    errorKey: "",
    statusKey: "state_ready_trim"
  });
}

function attachDropzone(element, onFile) {
  if (!element) {
    return;
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    element.addEventListener(eventName, (event) => {
      event.preventDefault();
      element.classList.add("is-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    element.addEventListener(eventName, (event) => {
      event.preventDefault();
      element.classList.remove("is-over");
    });
  });

  element.addEventListener("drop", async (event) => {
    const [file] = event.dataTransfer?.files || [];
    if (file) {
      await onFile(file);
    }
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatTime(seconds) {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.floor((total % 1) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(2, "0")}`;
}

async function startPreview(root, state) {
  stopPreview(root, state);

  const url = await createTrimmedPreviewUrl(state.audioBuffer, state.trimStart, state.trimEnd, {
    fadeIn: state.fadeIn,
    fadeOut: state.fadeOut
  });
  const audio = new Audio(url);

  previewController = {
    audio,
    url,
    rafId: 0
  };

  const renderPlayhead = () => {
    const canvas = root.querySelector("#trimWaveform");
    if (!canvas || !previewController || previewController.audio !== audio) {
      return;
    }

    drawWaveform(canvas, state.audioBuffer, state.trimStart, state.trimEnd, audio.currentTime);

    if (!audio.paused && !audio.ended) {
      previewController.rafId = requestAnimationFrame(renderPlayhead);
    }
  };

  audio.addEventListener("ended", () => {
    stopPreview(root, state);
  }, { once: true });

  await audio.play();
  renderPlayhead();
}

function stopPreview(root, state) {
  if (!previewController) {
    const canvas = root.querySelector("#trimWaveform");
    if (canvas && state?.audioBuffer) {
      drawWaveform(canvas, state.audioBuffer, state.trimStart, state.trimEnd);
    }
    return;
  }

  const { audio, url, rafId } = previewController;
  cancelAnimationFrame(rafId);
  audio.pause();
  audio.currentTime = 0;
  URL.revokeObjectURL(url);
  previewController = null;

  const canvas = root.querySelector("#trimWaveform");
  if (canvas && state?.audioBuffer) {
    drawWaveform(canvas, state.audioBuffer, state.trimStart, state.trimEnd);
  }
}

function syncFinalInputs(root, stateStore) {
  const titleInput = root.querySelector("#titleInput");
  const waveformToggle = root.querySelector("#waveformToggle");
  stateStore.set({
    title: titleInput?.value ?? stateStore.get().title,
    showWaveform: Boolean(waveformToggle?.checked)
  });
}

function warmupFfmpeg(stateStore) {
  if (ffmpegWarmupPromise) {
    return ffmpegWarmupPromise;
  }

  ffmpegWarmupPromise = ensureFfmpeg()
    .then((result) => {
      return result;
    })
    .catch((error) => {
      ffmpegWarmupPromise = null;
      console.warn("FFmpeg warmup failed", error);
      throw error;
    });

  return ffmpegWarmupPromise;
}
