import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'
import { initSetup } from 'v3/apiSetup'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  isArray,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling,
  isFunction
} from '../util/index'
import type { Component } from 'types/component'
import { shallowReactive, TrackOpTypes } from 'v3'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 代理的作用是把 props 和 data 上的属性代理到 vm 实例上
// 对 vm._props.xxx vm._data.xxxx的读写  变成了 vm.xxx 的读写
export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState(vm: Component) {
  const opts = vm.$options
  /*初始化props*/
  if (opts.props) initProps(vm, opts.props)

  // Composition API
  initSetup(vm)

  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    const ob = observe((vm._data = {}))
    ob && ob.vmCount++
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  // shallowReactive()是Vue 3中用于创建浅响应式对象的函数。浅响应式意味着只有对象的第一层属性是响应式的，而不会递归地将所有嵌套对象都变成响应式。在这里，我们将一个空对象传递给shallowReactive()，以创建一个初始为空的响应式对象。
  const props = (vm._props = shallowReactive({}))
  // 这一行代码创建了一个空数组keys，用于存储props的键名。同时，这个数组也被存储在组件实例的$options属性中，以便后续使用
  const keys: string[] = (vm.$options._propKeys = [])
  // 这里通过检查vm.$parent是否存在来确定当前组件是否为根组件。如果vm.$parent不存在，说明当前组件没有父组件，因此被认定为根组件
  const isRoot = !vm.$parent
  if (!isRoot) {
    // 调用了toggleObserving(false)函数来暂时关闭响应式系统。这是因为在非根组件中，props应该只能由父组件修改，而不应该在子组件内部被修改。
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    // 将prop的键名存储到keys数组中；
    keys.push(key)
    // 使用validateProp()函数验证props的值，并获取最终的值
    const value = validateProp(key, propsOptions, propsData, vm)
    // 开发环境下
    if (__DEV__) {
      // 使用hyphenate()函数将prop的键名转换为连字符格式（例如，camelCase会变成camel-case）。这是为了确保prop的键名不会与HTML属性冲突
      const hyphenatedKey = hyphenate(key)
      // 检查转换后的键名是否为保留的HTML属性或Vue保留的属性。如果是，则发出警告，提示开发者不要使用这些保留的属性名作为组件的prop。
      if (
        isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)
      ) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(
        props, // 响应式对象，存储所有props的数据
        key,  // 当前prop的键名
        value,  // 当前prop的初始值
        () => {
          // 回调函数：当prop的值被修改时，会执行这个回调函数。在回调函数中，如果当前组件不是根组件并且没有处于子组件更新过程中，则发出警告，提示开发者不要直接修改prop的值，因为在父组件重新渲染时，prop的值会被覆盖。建议使用基于prop值的data或computed属性来进行修改。
          if (!isRoot && !isUpdatingChildComponent) {
            warn(
              `Avoid mutating a prop directly since the value will be ` +
                `overwritten whenever the parent component re-renders. ` +
                `Instead, use a data or computed property based on the prop's ` +
                `value. Prop being mutated: "${key}"`,
              vm
            )
          }
        },
        // 表示浅响应，即只对第一层属性进行响应式处理
        true /* shallow */
      )
    } else {
      // 生产环境下 不进行额外的警告和检查
      defineReactive(props, key, value, undefined, true /* shallow */)
    }
    // 检查当前prop的键名key是否已经在组件实例vm上。如果key已经存在于vm上，说明它已经被代理过了，不需要再次代理
    if (!(key in vm)) {
      // 如果key不在vm上，则调用proxy函数，将key代理到vm上。
      // 将_props对象中的key属性代理到组件实例vm上。代理后的效果是可以通过vm.key来访问vm._props.key。
      proxy(vm, `_props`, key)
    }
  }
  // 调用了toggleObserving(true)函数重新开启响应式系统，确保后续的数据变化能够正常触发响应式更新
  toggleObserving(true)
}

/**
 * 
 * 初始化一个 data，并拿到 keys 集合
 * 遍历 keys 集合，来判断有没有和 props 里的属性名或者 methods 里的方法名重名的
 * 没有问题就通过 proxy() 把 data 里的每一个属性都代理到当前实例上，就可以通过 this.xx 访问了
 * 最后再调用 observe 监听整个 data
 */
function initData(vm: Component) {
  // 获取当前实例的 data
  let data: any = vm.$options.data
  // 如果 data 是一个函数，则执行该函数并将其返回值赋值给 data。
  data = vm._data = isFunction(data) ? getData(data, vm) : data || {}
  // 检查 data 是否为纯对象，如果不是则发出警告并将 data 设置为空对象 {}。
  if (!isPlainObject(data)) {
    data = {}
    __DEV__ &&
      warn(
        'data functions should return an object:\n' +
          'https://v2.vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
        vm
      )
  }
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  // 遍历 data 对象的所有属性，将它们代理到 Vue 实例上。
  while (i--) {
    const key = keys[i]
    if (__DEV__) {
      // 如果属性名与 props 或 methods 冲突，则发出警告。
      if (methods && hasOwn(methods, key)) {
        warn(`Method "${key}" has already been defined as a data property.`, vm)
      }
    }
    if (props && hasOwn(props, key)) {
      __DEV__ &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        )
        // isReserved 函数检查属性名是否是保留字段（以 $ 或 _ 开头的属性名是保留字段，用于框架内部用途）
    } else if (!isReserved(key)) {
      // proxy(vm, '_data', 'message');
      // 这个语句的作用是将 vm._data.message 属性代理到 vm 实例上，使得我们可以像访问 vm.message 一样访问和修改 message 属性。
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 调用 observe 函数，将 data 对象转换为响应式对象。
  const ob = observe(data)
  // 如果观察成功，增加 vmCount 计数。
  ob && ob.vmCount++
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e: any) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = (vm._computedWatchers = Object.create(null))
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = isFunction(userDef) ? userDef : userDef.get
    if (__DEV__ && getter == null) {
      warn(`Getter is missing for computed property "${key}".`, vm)
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (__DEV__) {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(
          `The computed property "${key}" is already defined as a method.`,
          vm
        )
      }
    }
  }
}

export function defineComputed(
  target: any,
  key: string,
  userDef: Record<string, any> | (() => any)
) {
  const shouldCache = !isServerRendering()
  if (isFunction(userDef)) {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (__DEV__ && sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter(key) {
  return function computedGetter() {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        if (__DEV__ && Dep.target.onTrack) {
          Dep.target.onTrack({
            effect: Dep.target,
            target: this,
            type: TrackOpTypes.GET,
            key
          })
        }
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this)
  }
}

function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (__DEV__) {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[
            key
          ]}" in the component definition. ` +
            `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(`Method "${key}" has already been defined as a prop.`, vm)
      }
      if (key in vm && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
            `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch(vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher(
  vm: Component,
  expOrFn: string | (() => any),
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin(Vue: typeof Component) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef: any = {}
  dataDef.get = function () {
    return this._data
  }
  const propsDef: any = {}
  propsDef.get = function () {
    return this._props
  }
  if (__DEV__) {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
          'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | (() => any),
    cb: any,
    options?: Record<string, any>
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`
      pushTarget()
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info)
      popTarget()
    }
    return function unwatchFn() {
      watcher.teardown()
    }
  }
}
