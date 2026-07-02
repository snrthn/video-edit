/**
 * ESM worker for @ffmpeg/ffmpeg
 * 放在 public/ 目录下，Vite 不会处理，浏览器直接执行
 * import() 不会被 Vite 拦截，不会加 ?import 参数
 */
const FFMessageType = {
  LOAD:       'LOAD',
  EXEC:       'EXEC',
  FFPROBE:    'FFPROBE',
  WRITE_FILE:  'WRITE_FILE',
  READ_FILE:   'READ_FILE',
  DELETE_FILE: 'DELETE_FILE',
  RENAME:      'RENAME',
  CREATE_DIR:  'CREATE_DIR',
  LIST_DIR:    'LIST_DIR',
  DELETE_DIR:  'DELETE_DIR',
  MOUNT:       'MOUNT',
  UNMOUNT:     'UNMOUNT',
  LOG:         'LOG',
  PROGRESS:    'PROGRESS',
  ERROR:       'ERROR'
}

let ffmpeg = null

async function load ({ coreURL, wasmURL, workerURL }) {
  const first = !ffmpeg
  try {
    if (!coreURL) {
      coreURL = '/ffmpeg-core-dist/umd/ffmpeg-core.js'
    }
    // 动态 import 加载 core（ESM 格式）
    // 这里不能用 importScripts（module worker 不支持）
    // 直接用动态 import，浏览器原生处理，Vite 不会拦截（因为此文件来自 public/）
    const mod = await import(/* @vite-ignore */ coreURL)
    const createFFmpegCore = mod.default || mod.createFFmpegCore
    if (!createFFmpegCore) throw new Error('createFFmpegCore not found in ' + coreURL)
    self.createFFmpegCore = createFFmpegCore
  } catch (e) {
    // fallback: 尝试 UMD 格式（用 fetch + eval）
    try {
      const resp = await fetch(coreURL)
      const txt = await resp.text()
      // UMD 包会把 createFFmpegCore 挂到 self 上
      ;(0, eval)(txt)
    } catch (e2) {
      throw new Error('Failed to load ffmpeg-core from ' + coreURL + ': ' + e + ' / ' + e2)
    }
  }

  const resolvedWasmURL = wasmURL
    ? wasmURL
    : coreURL.replace(/\.js$/, '.wasm')
  const resolvedWorkerURL = workerURL
    ? workerURL
    : coreURL.replace(/\.js$/, '.worker.js')

  ffmpeg = await self.createFFmpegCore({
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL: resolvedWasmURL, workerURL: resolvedWorkerURL }))}`
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
  const fs = ffmpeg.FS.filesystems[fsType]
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
