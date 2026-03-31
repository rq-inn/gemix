import { createPlaybackStream, renderProcessedBuffer } from "./audio.js";
import { FFmpeg } from "../vendor/ffmpeg/ffmpeg-esm/index.js";
import { fetchFile } from "../vendor/ffmpeg/util-esm/index.js";

let ffmpegApiPromise = null;

export async function ensureFfmpeg() {
  if (!ffmpegApiPromise) {
    ffmpegApiPromise = loadFfmpegApi();
  }
  return ffmpegApiPromise;
}

async function loadFfmpegApi() {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: new URL("../vendor/ffmpeg/ffmpeg-core.js", import.meta.url).toString(),
    wasmURL: new URL("../vendor/ffmpeg/ffmpeg-core.wasm", import.meta.url).toString()
  });

  return { ffmpeg, fetchFile };
}

export async function generateMp4(options) {
  options.onPhase?.("rendering_video");
  const processedBuffer = await renderProcessedBuffer(
    options.audioBuffer,
    options.trimStart,
    options.trimEnd,
    { fadeIn: options.fadeIn, fadeOut: options.fadeOut }
  );

  const webmBlob = await recordComposition(processedBuffer, options);
  const { ffmpeg, fetchFile } = await ensureFfmpeg();

  options.onPhase?.("encoding_mp4");
  await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));
  await ffmpeg.exec([
    "-y",
    "-i", "input.webm",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "192k",
    "output.mp4"
  ]);
  const data = await ffmpeg.readFile("output.mp4");
  await Promise.allSettled([
    ffmpeg.deleteFile("input.webm"),
    ffmpeg.deleteFile("output.mp4")
  ]);
  return new Blob([data.buffer], { type: "video/mp4" });
}

async function recordComposition(processedBuffer, options) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("recording-unsupported");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;

  if (typeof canvas.captureStream !== "function") {
    throw new Error("recording-unsupported");
  }

  const image = await loadImage(options.imageDataUrl);
  const duration = processedBuffer.duration;
  const stream = canvas.captureStream(30);
  const { liveContext, destination, source } = createPlaybackStream(processedBuffer);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm;codecs=vp8,opus";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000,
    audioBitsPerSecond: 192000
  });

  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  const stopPromise = new Promise((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType })), { once: true });
    recorder.addEventListener("error", (event) => reject(event.error), { once: true });
    window.setTimeout(() => reject(new Error("record-timeout")), Math.max(15000, Math.ceil(duration * 2000)));
  });

  const analyserData = processedBuffer.getChannelData(0);
  const startedAt = performance.now();

  recorder.start(250);
  await liveContext.resume();
  source.start();

  await animateCanvas({
    canvas,
    image,
    duration,
    title: options.title,
    showWaveform: options.showWaveform,
    analyserData,
    startedAt
  });

  recorder.stop();
  const recordedBlob = await stopPromise;
  stream.getTracks().forEach((track) => track.stop());
  await liveContext.close();
  return recordedBlob;
}

async function animateCanvas(options) {
  return new Promise((resolve) => {
    const context = options.canvas.getContext("2d");

    function frame() {
      const elapsed = (performance.now() - options.startedAt) / 1000;
      drawFrame(context, options, Math.min(elapsed, options.duration));
      if (elapsed < options.duration) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }

    frame();
  });
}

function drawFrame(context, options, elapsed) {
  const { canvas, image, title, showWaveform, analyserData, duration } = options;
  const w = canvas.width;
  const h = canvas.height;

  context.clearRect(0, 0, w, h);
  drawCoverImage(context, image, w, h);

  context.fillStyle = "rgba(19, 11, 7, 0.34)";
  context.fillRect(0, 0, w, h);

  context.save();
  context.shadowColor = "rgba(0,0,0,0.25)";
  context.shadowBlur = 40;
  roundRect(context, 138, 274, 804, 1024, 42);
  context.clip();
  drawContainedImage(context, image, 138, 274, 804, 1024);
  context.restore();

  context.fillStyle = "rgba(255, 245, 235, 0.9)";
  context.font = "600 64px 'Segoe UI', sans-serif";
  context.textAlign = "center";
  wrapText(context, title || "", w / 2, 150, 820, 78);

  context.fillStyle = "rgba(255, 245, 235, 0.92)";
  context.font = "500 30px 'Segoe UI', sans-serif";
  context.fillText("GemiX", w / 2, 1410);

  if (showWaveform) {
    const progress = Math.min(1, elapsed / Math.max(duration, 0.01));
    drawOutputWaveform(context, analyserData, progress, w, h);
  }
}

function drawCoverImage(context, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.filter = "blur(32px) saturate(1.05)";
  context.drawImage(image, x, y, drawWidth, drawHeight);
  context.filter = "none";
}

function drawContainedImage(context, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawOutputWaveform(context, data, progress, width, height) {
  const frameWidth = 860;
  const frameHeight = 220;
  const x = (width - frameWidth) / 2;
  const y = height - 320;

  context.fillStyle = "rgba(255,255,255,0.14)";
  roundRect(context, x, y, frameWidth, frameHeight, 30);
  context.fill();

  const samplesPerBucket = Math.max(1, Math.floor(data.length / frameWidth));
  const currentSample = Math.floor(data.length * progress);

  for (let px = 0; px < frameWidth; px += 1) {
    const start = px * samplesPerBucket;
    let peak = 0;
    for (let i = 0; i < samplesPerBucket && start + i < data.length; i += 1) {
      peak = Math.max(peak, Math.abs(data[start + i]));
    }
    const amp = peak * 82;
    const center = y + frameHeight / 2;
    context.strokeStyle = start < currentSample ? "#fff8ef" : "rgba(255,248,239,0.32)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + px, center - amp);
    context.lineTo(x + px, center + amp);
    context.stroke();
  }
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function wrapText(context, text, centerX, topY, maxWidth, lineHeight) {
  if (!text) {
    return;
  }

  const characters = [...text];
  const lines = [];
  let line = "";

  characters.forEach((char) => {
    const testLine = line + char;
    if (context.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = testLine;
    }
  });

  if (line) {
    lines.push(line);
  }

  lines.slice(0, 3).forEach((entry, index) => {
    context.fillText(entry, centerX, topY + lineHeight * index);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
