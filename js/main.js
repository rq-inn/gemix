import { bootApp } from "./app.js";
import { isSmartphoneDevice } from "./device.js";

async function main() {
  if (window.__GEMIX_BLOCKED__ || isSmartphoneDevice()) {
    return;
  }

  registerServiceWorker();

  const root = document.querySelector("#app");
  await bootApp(root);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

main().catch((error) => {
  console.error(error);
});
