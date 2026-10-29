let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

function getIO() {
  return ioInstance;
}

function broadcast(event, data) {
  try {
    if (ioInstance) ioInstance.emit(event, data);
  } catch (e) {
    console.error("[io] broadcast " + event + " gagal:", e.message);
  }
}

module.exports = { setIO, getIO, broadcast };