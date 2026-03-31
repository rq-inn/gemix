const defaultState = {
  screen: "home",
  languageNumber: "1",
  languages: [],
  messages: new Map(),
  statusKey: "",
  errorKey: "",
  audioFile: null,
  audioFileName: "",
  audioBuffer: null,
  audioDuration: 0,
  trimStart: 0,
  trimEnd: 0,
  fadeIn: false,
  fadeOut: false,
  imageFile: null,
  imageFileName: "",
  imageDataUrl: "",
  title: "",
  showWaveform: false,
  generating: false
};

export function createState() {
  const state = structuredClone(defaultState);
  const listeners = new Set();

  function notify() {
    listeners.forEach((listener) => listener(state));
  }

  return {
    get() {
      return state;
    },
    set(patch) {
      Object.assign(state, patch);
      notify();
    },
    resetAudioSelection() {
      Object.assign(state, {
        audioFile: null,
        audioFileName: "",
        audioBuffer: null,
        audioDuration: 0,
        trimStart: 0,
        trimEnd: 0,
        fadeIn: false,
        fadeOut: false
      });
      notify();
    },
    resetImageSelection() {
      Object.assign(state, {
        imageFile: null,
        imageFileName: "",
        imageDataUrl: ""
      });
      notify();
    },
    resetAfterDownload() {
      Object.assign(state, {
        screen: "audio",
        statusKey: "audio_waiting",
        errorKey: "",
        audioFile: null,
        audioFileName: "",
        audioBuffer: null,
        audioDuration: 0,
        trimStart: 0,
        trimEnd: 0,
        fadeIn: false,
        fadeOut: false,
        imageFile: null,
        imageFileName: "",
        imageDataUrl: "",
        title: "",
        showWaveform: false,
        generating: false
      });
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
