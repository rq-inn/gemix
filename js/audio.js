const audioContext = new (window.AudioContext || window.webkitAudioContext)();

export async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  return decoded;
}

export function clampTrimRange(start, end, duration) {
  const safeStart = Math.max(0, Math.min(start, duration));
  const safeEnd = Math.max(safeStart + 0.01, Math.min(end, duration));
  return { start: safeStart, end: safeEnd };
}

export async function createTrimmedPreviewUrl(audioBuffer, startTime, endTime, options = {}) {
  const processed = await renderProcessedBuffer(audioBuffer, startTime, endTime, options);
  const wavBuffer = audioBufferToWav(processed);
  return URL.createObjectURL(new Blob([wavBuffer], { type: "audio/wav" }));
}

export async function renderProcessedBuffer(audioBuffer, startTime, endTime, options = {}) {
  const lengthSeconds = Math.max(0.01, endTime - startTime);
  const frameCount = Math.ceil(lengthSeconds * audioBuffer.sampleRate);
  const offlineContext = new OfflineAudioContext(audioBuffer.numberOfChannels, frameCount, audioBuffer.sampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = offlineContext.createGain();
  const fadeDuration = Math.min(1.2, lengthSeconds / 4);
  gainNode.gain.setValueAtTime(options.fadeIn ? 0 : 1, 0);

  if (options.fadeIn) {
    gainNode.gain.linearRampToValueAtTime(1, fadeDuration);
  }

  if (options.fadeOut) {
    const fadeOutStart = Math.max(0, lengthSeconds - fadeDuration);
    gainNode.gain.setValueAtTime(1, fadeOutStart);
    gainNode.gain.linearRampToValueAtTime(0, lengthSeconds);
  }

  source.connect(gainNode);
  gainNode.connect(offlineContext.destination);
  source.start(0, startTime, lengthSeconds);
  return offlineContext.startRendering();
}

export function createPlaybackStream(processedBuffer) {
  const liveContext = new (window.AudioContext || window.webkitAudioContext)();
  const destination = liveContext.createMediaStreamDestination();
  const source = liveContext.createBufferSource();
  source.buffer = processedBuffer;
  source.connect(destination);
  source.connect(liveContext.destination);
  return { liveContext, destination, source };
}

export function drawWaveform(canvas, audioBuffer, startTime, endTime, playheadTime = null) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  context.fillStyle = "#fffaf3";
  context.fillRect(0, 0, width, height);

  if (!audioBuffer) {
    return;
  }

  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const duration = Math.max(0.01, audioBuffer.duration);
  const startRatio = Math.max(0, Math.min(1, startTime / duration));
  const endRatio = Math.max(startRatio, Math.min(1, endTime / duration));
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / width));

  context.fillStyle = "rgba(196, 79, 47, 0.08)";
  context.fillRect(0, 0, startRatio * width, height);
  context.fillRect(endRatio * width, 0, width - endRatio * width, height);

  context.strokeStyle = "#c44f2f";
  context.lineWidth = 2;
  context.beginPath();

  for (let x = 0; x < width; x += 1) {
    const offset = x * samplesPerBucket;
    let peak = 0;
    for (let i = 0; i < samplesPerBucket && offset + i < totalSamples; i += 1) {
      peak = Math.max(peak, Math.abs(channelData[offset + i]));
    }
    const amplitude = peak * (height * 0.42);
    const center = height / 2;
    context.moveTo(x, center - amplitude);
    context.lineTo(x, center + amplitude);
  }

  context.stroke();

  context.strokeStyle = "rgba(196, 79, 47, 0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(startRatio * width, 0);
  context.lineTo(startRatio * width, height);
  context.moveTo(endRatio * width, 0);
  context.lineTo(endRatio * width, height);
  context.stroke();

  if (typeof playheadTime === "number" && Number.isFinite(playheadTime)) {
    const absoluteTime = startTime + playheadTime;
    const normalized = Math.max(0, Math.min(1, absoluteTime / duration));
    const x = normalized * width;

    context.strokeStyle = "#184c8c";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
}

function audioBufferToWav(buffer) {
  const channelCount = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const samples = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = samples * blockAlign;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let sample = 0; sample < samples; sample += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = buffer.getChannelData(channel)[sample];
      const normalized = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff, true);
      offset += 2;
    }
  }

  return output;
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
