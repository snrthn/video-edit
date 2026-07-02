/**
 * Classic worker for @ffmpeg/ffmpeg
 * 放在 public/ 目录下，Vite 不会处理
 * 完全复刻官方 worker 逻辑，使用 importScripts 加载 UMD 格式的 ffmpeg-core
 */
self.importScripts('/ffmpeg-core-dist/umd/ffmpeg-core.js')

// FFMessageType 枚举（与 @ffmpeg/ffmpeg 保持一致）
const FFMessageType = {
  LOAD: 'LOAD',
  EXEC: 'EXEC',
  FFPROBE: 'FFPROBE',
  WRITE_FILE: 'WRITE_FILE',
  READ_FILE: 'READ_FILE',
  DELETE_FILE: 'DELETE_FILE',
  RENAME: 'RENAME',
  CREATE_DIR: 'CREATE_DIR',
  LIST_DIR: 'LIST_DIR',
  DELETE_DIR: 'DELETE_DIR',
  MOUNT: 'MOUNT',
  UNMOUNT: 'UNMOUNT',
  LOG: 'LOG',
  PROGRESS: 'PROGRESS',
  ERROR: 'ERROR'
}

let ffmpeg = null

async function load ({ coreURL: _coreURL, wasmURL: _wasmURL, workerURL: _workerURL }) {
  const first = !ffmpeg
  try {
    if (!_coreURL) _coreURL = '/ffmpeg-core-dist/umd/ffmpeg-core.js'
    // classic worker 中用 importScripts 加载 UMD 格式的 core
    self.importScripts(_coreURL)
  } catch (e) {
    // importScripts 失败不应该到这里，除非路径错误
    throw e
  }
  const coreURL = _coreURL
  const wasmURL = _wasmURL ? _wasmURL : coreURL.replace(/\.js$/g, '.wasm')
  const workerURL = _workerURL ? _workerURL : coreURL.replace(/\.js$/g, '.worker.js')
  // createFFmpegCore 由 UMD ffmpeg-core.js 暴露到 self 上
  ffmpeg = await self.createFFmpegCore({
    // 与官方 worker 一致的 hack：编码 wasmURL 到 URL hash 中
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`
  })
  ffmpeg.setLogger((data) => self.postMessage({ type: FFMessageType.LOG, data }))
  ffmpeg.setProgress((data) => self.postMessage({ type: FFMessageType.PROGRESS, data }))
  return first
}

function exec ({ args, timeout = -1 }) {
  ffmpeg.setTimeout(timeout)
  ffmpeg.exec(...args)
  const ret = ffmpeg.ret
  ffmpeg.reset()
  return ret
}

function ffprobe ({ args, timeout = -1 }) {
  ffmpeg.setTimeout(timeout)
  ffmpeg.ffprobe(...args)
  const ret = ffmpeg.ret
  ffmpeg.reset()
  return ret
}

function writeFile ({ path, data }) {
  ffmpeg.FS.writeFile(path, data)
  return true
}

function readFile ({ path, encoding }) {
  return ffmpeg.FS.readFile(path, { encoding })
}

function deleteFile ({ path }) {
  ffmpeg.FS.unlink(path)
  return true
}

function rename ({ oldPath, newPath }) {
  ffmpeg.FS.rename(oldPath, newPath)
  return true
}

function createDir ({ path }) {
  ffmpeg.FS.mkdir(path)
  return true
}

function listDir ({ path }) {
  const names = ffmpeg.FS.readdir(path)
  const nodes = []
  for (const name of names) {
    const stat = ffmpeg.FS.stat(`${path}/${name}`)
    const isDir = ffmpeg.FS.isDir(stat.mode)
    nodes.push({ name, isDir })
  }
  return nodes
}

function deleteDir ({ path }) {
  ffmpeg.FS.rmdir(path)
  return true
}

function mount ({ fsType, options, mountPoint }) {
  const str = fsType
  const fs = ffmpeg.FS.filesystems[str]
  if (!fs) return false
  ffmpeg.FS.mount(fs, options, mountPoint)
  return true
}

function unmount ({ mountPoint }) {
  ffmpeg.FS.unmount(mountPoint)
  return true
}

self.onmessage = async ({ data: { id, type, data: _data } }) => {
  const trans = []
  let data
  try {
    if (type !== FFMessageType.LOAD && !ffmpeg) {
      throw new Error('FFmpeg not loaded')
    }
    switch (type) {
      case FFMessageType.LOAD:
        data = await load(_data)
        break
      case FFMessageType.EXEC:
        data = exec(_data)
        break
      case FFMessageType.FFPROBE:
        data = ffprobe(_data)
        break
      case FFMessageType.WRITE_FILE:
        data = writeFile(_data)
        break
      case FFMessageType.READ_FILE:
        data = readFile(_data)
        break
      case FFMessageType.DELETE_FILE:
        data = deleteFile(_data)
        break
      case FFMessageType.RENAME:
        data = rename(_data)
        break
      case FFMessageType.CREATE_DIR:
        data = createDir(_data)
        break
      case FFMessageType.LIST_DIR:
        data = listDir(_data)
        break
      case FFMessageType.DELETE_DIR:
        data = deleteDir(_data)
        break
      case FFMessageType.MOUNT:
        data = mount(_data)
        break
      case FFMessageType.UNMOUNT:
        data = unmount(_data)
        break
      default:
        throw new Error(`Unknown message type: ${type}`)
    }
  } catch (e) {
    self.postMessage({ id, type: FFMessageType.ERROR, data: e.toString() })
    return
  }
  if (data instanceof Uint8Array) {
    trans.push(data.buffer)
  }
  self.postMessage({ id, type, data }, trans)
}
