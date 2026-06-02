/**
 * 命令模式历史管理器
 *
 * 替代原来 timeline store 中的深拷贝快照方案。
 * 每条命令包含正向数据（data）和逆向数据（inverse），
 * 比深拷贝快照省内存，也更容易实现精确的职务/重做。
 *
 * Usage:
 *   const history = new HistoryManager()
 *   history.push({ data: {...}, inverse: {...} })
 *   history.undo((cmd) => apply(cmd))   // 参数是 inverse
 *   history.redo((cmd) => apply(cmd))   // 参数是 data
 */

import { MAX_HISTORY_SIZE } from './constants'

export class HistoryManager {
  constructor(maxSize = MAX_HISTORY_SIZE) {
    this.stack = []
    this.index = -1
    this.maxSize = maxSize
  }

  /**
   * 推入一条命令
   * @param {Object} command - { type: string, data: any, inverse: any }
   */
  push(command) {
    // 丢弃 index 之后的记录
    this.stack = this.stack.slice(0, this.index + 1)
    this.stack.push(command)

    // 超出容量时剔除最早的
    if (this.stack.length > this.maxSize) {
      this.stack.shift()
    } else {
      this.index++
    }
  }

  /**
   * 撤销：返回需要应用的数据（即 inverse）
   * @returns {Object|null} inverse command
   */
  undo() {
    if (this.index < 0) return null
    const cmd = this.stack[this.index]
    this.index--
    return cmd.inverse
  }

  /**
   * 重做：返回需要应用的数据（即 data）
   * @returns {Object|null} forward command
   */
  redo() {
    if (this.index >= this.stack.length - 1) return null
    this.index++
    return this.stack[this.index].data
  }

  get canUndo() {
    return this.index >= 0
  }

  get canRedo() {
    return this.index < this.stack.length - 1
  }

  clear() {
    this.stack = []
    this.index = -1
  }

  /**
   * 克隆当前栈状态（用于持久化）
   */
  snapshot() {
    return {
      stack: JSON.parse(JSON.stringify(this.stack)),
      index: this.index
    }
  }

  /**
   * 从快照恢复
   */
  restore(snapshot) {
    if (!snapshot) return
    this.stack = snapshot.stack || []
    this.index = snapshot.index ?? -1
  }
}