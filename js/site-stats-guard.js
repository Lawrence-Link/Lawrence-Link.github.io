(() => {
  const stats = ['site_uv', 'site_pv']
  const cacheKey = 'me0w-site-stats-v1'
  const timeoutMs = 8000
  let timeoutId
  let observer

  const elements = () => stats
    .map(name => document.getElementById(`busuanzi_value_${name}`))
    .filter(Boolean)

  const isResolved = element => element && !element.dataset.statsState && !element.querySelector('.fa-spinner') && /^\d[\d,]*$/.test(element.textContent.trim())

  const readCache = () => {
    try {
      return JSON.parse(localStorage.getItem(cacheKey)) || {}
    } catch {
      return {}
    }
  }

  const writeCache = targets => {
    const values = {}
    for (const element of targets) {
      const name = element.id.replace('busuanzi_value_', '')
      values[name] = element.textContent.trim()
    }

    try {
      localStorage.setItem(cacheKey, JSON.stringify(values))
    } catch {
      // Statistics remain usable when storage is disabled.
    }
  }

  const stopWatching = () => {
    clearTimeout(timeoutId)
    observer?.disconnect()
    observer = null
  }

  const settleUnavailable = targets => {
    stopWatching()
    const cached = readCache()
    for (const element of targets) {
      if (isResolved(element)) continue
      const name = element.id.replace('busuanzi_value_', '')
      element.textContent = cached[name] || '--'
      element.title = cached[name] ? '最近一次成功加载的统计值' : '统计服务暂时不可用'
      element.dataset.statsState = cached[name] ? 'cached' : 'unavailable'
    }

    observer = new MutationObserver(() => {
      for (const element of targets) {
        if (!element.dataset.statsState || element.querySelector('.fa-spinner')) continue
        if (!/^\d[\d,]*$/.test(element.textContent.trim())) continue
        element.removeAttribute('title')
        delete element.dataset.statsState
      }
      if (targets.every(isResolved)) {
        writeCache(targets)
        stopWatching()
      }
    })
    for (const element of targets) observer.observe(element, { childList: true, subtree: true, characterData: true })
  }

  const watchStats = () => {
    stopWatching()
    const targets = elements()
    if (!targets.length) return

    const captureResolved = () => {
      if (!targets.every(isResolved)) return
      writeCache(targets)
      for (const element of targets) {
        element.removeAttribute('title')
        delete element.dataset.statsState
      }
      stopWatching()
    }

    observer = new MutationObserver(captureResolved)
    for (const element of targets) observer.observe(element, { childList: true, subtree: true, characterData: true })
    timeoutId = setTimeout(() => settleUnavailable(targets), timeoutMs)
    captureResolved()
  }

  document.addEventListener('pjax:complete', watchStats)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchStats, { once: true })
  else watchStats()
})()
