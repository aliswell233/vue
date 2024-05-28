/* globals MutationObserver */

import { noop } from 'shared/util' // 一个空函数，占位用。
import { handleError } from './error' // 错误处理函数
import { isIE, isIOS, isNative } from './env' // 环境检测相关函数

export let isUsingMicroTask = false  // 标记是否使用微任务

const callbacks: Array<Function> = []  //  存储所有待执行的回调函数  
let pending = false // 标记是否有待处理的回调

// 函数负责执行所有存储在 callbacks 数组中的回调函数，并清空数组----
function flushCallbacks() {
  pending = false
  // 使用 slice(0) 方法生成一个新的数组，包含了 callbacks 中的所有元素。这样做的目的是在遍历和执行回调函数时，不会受到 callbacks 数组在执行过程中可能发生的变化的影响
  const copies = callbacks.slice(0)
  // 这行代码将 callbacks 数组的长度设为 0，实际上是清空了 callbacks 数组。因为所有的回调函数已经被复制到了 copies 数组中，我们可以安全地清空 callbacks 数组，以便在接下来的异步任务中接收新的回调函数
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

/**
 * 这段代码根据不同的环境选择合适的异步任务调度方法，以确保异步回调能够尽快执行。
优先选择微任务（Promise 和 MutationObserver），因为它们比宏任务（setImmediate 和 setTimeout）更快。
最后选择 setTimeout 作为降级方案，以保证在所有环境下都能正常工作
 */

// 一个函数变量，用于保存不同环境下异步任务的具体实现
let timerFunc

// 检查 Promise 是否可用且是原生实现 微任务
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  // 创建一个立即 resolve 的 Promise 对象 p
  const p = Promise.resolve()
  timerFunc = () => {
    // 该函数调用 p.then(flushCallbacks) 来将 flushCallbacks 放入微任务队列中。
    p.then(flushCallbacks)
    // 如果是 iOS 设备，调用 setTimeout(noop) 以修复一些特定的 bug
    if (isIOS) setTimeout(noop)
  }
  // 将 isUsingMicroTask 标记为 true，表示当前使用的是微任务
  isUsingMicroTask = true
} else if (
  // 使用 MutationObserver 实现微任务
  // 检查 MutationObserver 是否可用且是原生实现的，并且不是 IE 浏览器
  !isIE &&
  typeof MutationObserver !== 'undefined' &&
  (isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]')
) {
  let counter = 1
  // 创建一个 MutationObserver 实例 observer，监听一个文本节点 textNode 的字符数据变化
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  // 该函数修改文本节点的内容，从而触发 MutationObserver，执行 flushCallbacks
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  // 将 isUsingMicroTask 标记为 true
  isUsingMicroTask = true
} else if (
  // 检查 setImmediate 是否可用且是原生实现的 实现宏任务
  typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    // 该函数调用 setImmediate(flushCallbacks) 将 flushCallbacks 放入宏任务队列中
    setImmediate(flushCallbacks)
  }
} else {
  // 使用 setTimeout 实现宏任务（降级方案）
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}
/**
 *  这几行定义了 nextTick 函数的三种重载
 * 
 * nextTick 函数可以接受一个回调函数 cb 和一个上下文 ctx，或者什么都不传。
将回调函数（或 Promise 的 resolve 函数）加入到 callbacks 数组中。
如果当前没有异步任务在处理，调用 timerFunc 启动一个新的异步任务。
如果没有传递回调函数并且 Promise 存在，返回一个新的 Promise。
 * */ 
//  不带参数，返回一个 Promise<void>
export function nextTick(): Promise<void>
// 带有回调函数 cb
export function nextTick<T>(this: T, cb: (this: T, ...args: any[]) => any): void
// 带有回调函数 cb 和上下文 ctx
export function nextTick<T>(cb: (this: T, ...args: any[]) => any, ctx: T): void
/**
 * @internal
 * 这是 nextTick 函数的具体实现，接收一个可选的回调函数 cb 和一个可选的上下文 ctx
 */
export function nextTick(cb?: (...args: any[]) => any, ctx?: object) {
  // 用于存储 Promise 的 resolve 函数
  let _resolve
  callbacks.push(() => { // 将一个箭头函数加入 callbacks 数组
    if (cb) { //用 ctx 调用 cb，并捕获任何错误，调用 handleError 处理错误
      try {
        cb.call(ctx)
      } catch (e: any) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      // 调用 _resolve(ctx) 来解决 Promise
      _resolve(ctx)
    }
  })
  // 启动异步任务
  // 如果 pending 为 false，表示当前没有异步任务在处理。将 pending 设为 true，表示现在有任务正在处理。 调用 timerFunc 启动异步任务。
  if (!pending) {
    pending = true
    timerFunc()
  }
  // $flow-disable-line
  // 如果没有传递回调函数 cb 并且 Promise 存在
  if (!cb && typeof Promise !== 'undefined') {
    // 返回一个新的 Promise 对象，并将其 resolve 函数赋值给 _resolve
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
