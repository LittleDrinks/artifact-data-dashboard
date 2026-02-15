const { LocalFileDriver } = require('./local-file-driver');

let storageSingleton = null;

const getStorageDriver = () => {
  if (storageSingleton) {
    return storageSingleton;
  }

  // 目前仅实现本地文件系统；后续可扩展 S3Driver
  storageSingleton = new LocalFileDriver();
  return storageSingleton;
};

module.exports = {
  getStorageDriver
};
