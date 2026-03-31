const FFMessageType = {
  LOAD: "LOAD",
  EXEC: "EXEC",
  WRITE_FILE: "WRITE_FILE",
  READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE",
  RENAME: "RENAME",
  CREATE_DIR: "CREATE_DIR",
  LIST_DIR: "LIST_DIR",
  DELETE_DIR: "DELETE_DIR",
  ERROR: "ERROR",
  DOWNLOAD: "DOWNLOAD",
  PROGRESS: "PROGRESS",
  LOG: "LOG",
  MOUNT: "MOUNT",
  UNMOUNT: "UNMOUNT",
  FFPROBE: "FFPROBE"
};

const ERROR_TERMINATED = new Error("called FFmpeg.terminate()");
const ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");

const getMessageID = (() => {
  let messageID = 0;
  return () => messageID++;
})();

export class FFmpeg {
  #worker = null;
  #resolves = {};
  #rejects = {};
  #logEventCallbacks = [];
  #progressEventCallbacks = [];
  loaded = false;

  #registerHandlers = () => {
    if (!this.#worker) {
      return;
    }

    this.#worker.onmessage = ({ data: { id, type, data } }) => {
      switch (type) {
        case FFMessageType.LOAD:
          this.loaded = true;
          this.#resolves[id]?.(data);
          break;
        case FFMessageType.MOUNT:
        case FFMessageType.UNMOUNT:
        case FFMessageType.EXEC:
        case FFMessageType.FFPROBE:
        case FFMessageType.WRITE_FILE:
        case FFMessageType.READ_FILE:
        case FFMessageType.DELETE_FILE:
        case FFMessageType.RENAME:
        case FFMessageType.CREATE_DIR:
        case FFMessageType.LIST_DIR:
        case FFMessageType.DELETE_DIR:
          this.#resolves[id]?.(data);
          break;
        case FFMessageType.LOG:
          this.#logEventCallbacks.forEach((callback) => callback(data));
          break;
        case FFMessageType.PROGRESS:
          this.#progressEventCallbacks.forEach((callback) => callback(data));
          break;
        case FFMessageType.ERROR:
          this.#rejects[id]?.(data);
          break;
      }

      delete this.#resolves[id];
      delete this.#rejects[id];
    };
  };

  #send = ({ type, data }, trans = [], signal) => {
    if (!this.#worker) {
      return Promise.reject(ERROR_NOT_LOADED);
    }

    return new Promise((resolve, reject) => {
      const id = getMessageID();
      this.#worker.postMessage({ id, type, data }, trans);
      this.#resolves[id] = resolve;
      this.#rejects[id] = reject;

      signal?.addEventListener("abort", () => {
        reject(new DOMException(`Message # ${id} was aborted`, "AbortError"));
      }, { once: true });
    });
  };

  load = ({ classWorkerURL, ...config } = {}, { signal } = {}) => {
    if (!this.#worker) {
      this.#worker = classWorkerURL
        ? new Worker(new URL(classWorkerURL, import.meta.url), { type: "module" })
        : new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      this.#registerHandlers();
    }

    return this.#send({
      type: FFMessageType.LOAD,
      data: config
    }, undefined, signal);
  };

  exec = (args, timeout = -1, { signal } = {}) => this.#send({
    type: FFMessageType.EXEC,
    data: { args, timeout }
  }, undefined, signal);

  ffprobe = (args, timeout = -1, { signal } = {}) => this.#send({
    type: FFMessageType.FFPROBE,
    data: { args, timeout }
  }, undefined, signal);

  writeFile = (path, data, { signal } = {}) => {
    const trans = [];
    if (data instanceof Uint8Array) {
      trans.push(data.buffer);
    }

    return this.#send({
      type: FFMessageType.WRITE_FILE,
      data: { path, data }
    }, trans, signal);
  };

  readFile = (path, encoding = "binary", { signal } = {}) => this.#send({
    type: FFMessageType.READ_FILE,
    data: { path, encoding }
  }, undefined, signal);

  deleteFile = (path, { signal } = {}) => this.#send({
    type: FFMessageType.DELETE_FILE,
    data: { path }
  }, undefined, signal);

  deleteDir = (path, { signal } = {}) => this.#send({
    type: FFMessageType.DELETE_DIR,
    data: { path }
  }, undefined, signal);

  terminate = () => {
    const ids = Object.keys(this.#rejects);
    for (const id of ids) {
      this.#rejects[id](ERROR_TERMINATED);
      delete this.#rejects[id];
      delete this.#resolves[id];
    }

    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
      this.loaded = false;
    }
  };
}
