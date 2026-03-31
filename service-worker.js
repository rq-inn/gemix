const CACHE_NAME = "gemix-v5";
const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/common.css",
  "./css/pc.css",
  "./data/language.csv",
  "./data/message.csv",
  "./image/icon64.png",
  "./image/icon256.png",
  "./image/icon512.png",
  "./image/rq-inn-logo.png",
  "./js/app.js",
  "./js/audio.js",
  "./js/csv.js",
  "./js/device.js",
  "./js/language.js",
  "./js/main.js",
  "./js/messages.js",
  "./js/state.js",
  "./js/video.js",
  "./js/video-pwa5.js",
  "./js/ffmpeg/fetch-file.js",
  "./js/ffmpeg/fetch-file-pwa5.js",
  "./js/ffmpeg/ffmpeg-api.js",
  "./js/ffmpeg/ffmpeg-api-pwa5.js",
  "./js/ffmpeg/worker.js",
  "./js/ui/screens.js",
  "./js/ffmpeg/ffmpeg-core.js",
  "./js/ffmpeg/ffmpeg-core.wasm",
  "./js/ffmpeg/ffmpeg-esm/classes.js",
  "./js/ffmpeg/ffmpeg-esm/const.js",
  "./js/ffmpeg/ffmpeg-esm/errors.js",
  "./js/ffmpeg/ffmpeg-esm/index.js",
  "./js/ffmpeg/ffmpeg-esm/utils.js",
  "./js/ffmpeg/ffmpeg-esm/worker.js",
  "./js/ffmpeg/util-esm/const.js",
  "./js/ffmpeg/util-esm/errors.js",
  "./js/ffmpeg/util-esm/index.js",
  "./js/ffmpeg/util-esm/types.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(handleAssetRequest(request));
});

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put("./index.html", response.clone());
    return response;
  } catch (error) {
    return (await caches.match("./index.html")) || (await caches.match("./"));
  }
}

async function handleAssetRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
