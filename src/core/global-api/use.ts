import type { GlobalAPI } from 'types/global-api'
import { toArray, isFunction } from '../util/index'

export function initUse(Vue: GlobalAPI) {

  Vue.use = function (plugin: Function | any) {
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = [])
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // Vue.use(MyPlugin, { someOption: true });
    // toArray(arguments, 1) 将 { someOption: true } 转换为数组 [{ someOption: true }]
    const args = toArray(arguments, 1)
    // args.unshift(this) 将 Vue 添加到数组的开头，变为 [Vue, { someOption: true }]。
    args.unshift(this)
    if (isFunction(plugin.install)) {
      // 调用 plugin.install.apply(plugin, args)，相当于调用 MyPlugin.install(Vue, { someOption: true })。
      plugin.install.apply(plugin, args)
    } else if (isFunction(plugin)) {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
