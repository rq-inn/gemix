export function isSmartphoneDevice() {
  const ua = navigator.userAgent || "";
  return /iPhone|Android.+Mobile|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}
