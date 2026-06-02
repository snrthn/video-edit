// 时间轴核心常量
// 所有数值魔法值都集中在这里

// === 坐标系统 ===
export const BASE_PPS = 100 // 基准像素/秒 (pixels per second)
export const MIN_PPS = 10 // 最小缩放
export const MAX_PPS = 2000 // 最大缩放
export const TRACK_LABEL_WIDTH = 80 // 轨道标签宽度 px
export const CLIP_MIN_WIDTH = 30 // clip 最小渲染宽度 px
export const RULER_HEIGHT = 30 // 时间尺高度 px
export const SNAP_THRESHOLD = 8 // 吸附阈值 px
export const TRIM_HANDLE_WIDTH = 8 // trim 手柄热区宽度 px

// === 缩放 ===
export const ZOOM_STEP = 0.1 // 滑条缩放步进
export const ZOOM_MIN_DISPLAY = 0.1 // 最小显示缩放
export const ZOOM_MAX_DISPLAY = 10 // 最大显示缩放
export const WHEEL_ZOOM_FACTOR = 1.1 // 滚轮缩放系数

// === 时间刻度 ===
export const TICK_MIN_PIXEL_GAP = 80 // 两刻度间最小像素间距
export const TICK_INTERVALS = [0.1, 0.5, 1, 2, 5, 10, 30, 60] // 可用刻度间隔（秒）
export const MAJOR_TICK_EVERY = 5 // 每 N 个刻度一个主刻度

// === 历史 ===
export const MAX_HISTORY_SIZE = 50

// === clip ===
export const NEW_CLIP_DEFAULT_DURATION = 10 // 新建 clip 默认时长
export const CLIP_DUPLICATE_GAP = 0.5 // 复制 clip 的偏移秒数

// === 播放 ===
export const VOLUME_MIN = 0
export const VOLUME_MAX = 2
export const RATE_MIN = 0.25
export const RATE_MAX = 4
export const SKIP_DELTA = 5 // 快进/后退秒数

// === 播放头 ===
export const PLAYHEAD_PROGRESS_INTERVAL = 100 // 播放头同步间隔 ms
export const PLAYHEAD_MOVE_INTERVAL = 16 // 播放头移动动画间隔 ms
export const PLAYHEAD_MOVE_STEP = 0.016 // 播放头移动每帧步进秒数
export const PLAYHEAD_REACH_THRESHOLD = 0.05 // 到达目标阈值

// === 跨 clip 衔接 ===
export const CLIP_SWITCH_DELAY = 100 // clip 切换延迟 ms
export const PLAYHEAD_MOVE_GAP_THRESHOLD = 0.5 // 超过此秒数则动画移动播放头

// === 编辑器 ===
export const DEFAULT_OUTPUT_WIDTH = 1920
export const DEFAULT_OUTPUT_HEIGHT = 1080
export const DEFAULT_OUTPUT_FRAMERATE = 30