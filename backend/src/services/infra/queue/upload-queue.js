class UploadQueue {
  constructor({ concurrency = 2 } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 2);
    this.running = 0;
    this.queue = [];
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    while (this.running < this.concurrency && this.queue.length) {
      const item = this.queue.shift();
      this.running += 1;

      Promise.resolve()
        .then(item.task)
        .then(result => item.resolve(result))
        .catch(err => item.reject(err))
        .finally(() => {
          this.running -= 1;
          this._drain();
        });
    }
  }
}

let singleton = null;

const getUploadQueue = () => {
  if (!singleton) {
    singleton = new UploadQueue({ concurrency: Number(process.env.ATTACHMENT_UPLOAD_CONCURRENCY || 2) });
  }
  return singleton;
};

module.exports = {
  UploadQueue,
  getUploadQueue
};
