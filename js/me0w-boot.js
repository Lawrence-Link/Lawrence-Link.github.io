(() => {
  const storageKey = 'me0w-home-boot-seen'
  let activeBoot = null

  const isHome = () => location.pathname === '/' || location.pathname === '/index.html'

  const hasBeenSeen = () => {
    try {
      return sessionStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  }

  const markAsSeen = () => {
    try {
      sessionStorage.setItem(storageKey, '1')
    } catch {
      // The intro still works when session storage is unavailable.
    }
  }

  const startBoot = () => {
    if (!isHome() || activeBoot || hasBeenSeen() || matchMedia('(prefers-reduced-motion: reduce)').matches) return

    markAsSeen()
    document.documentElement.classList.add('me0w-booting')

    const boot = document.createElement('div')
    boot.id = 'me0w-boot'
    boot.setAttribute('role', 'status')
    boot.setAttribute('aria-label', 'me0w is loading')
    boot.innerHTML = `
      <div class="me0w-boot-console">
        <div class="me0w-boot-kicker">ME0W://BOOT</div>
        <div class="me0w-boot-wordmark">me0w<span class="me0w-boot-cursor">_</span></div>
        <div class="me0w-boot-log" aria-hidden="true">
          <span>purripheral bus <b>ready</b></span>
          <span>PixelUI link <b>ready</b></span>
        </div>
        <div class="me0w-boot-progress" aria-hidden="true"></div>
      </div>`

    document.body.appendChild(boot)
    activeBoot = boot

    const finish = () => {
      if (!activeBoot) return
      activeBoot.classList.add('is-done')
      document.documentElement.classList.remove('me0w-booting')
      setTimeout(() => {
        activeBoot?.remove()
        activeBoot = null
      }, 360)
    }

    const waitForPage = document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise(resolve => window.addEventListener('load', resolve, { once: true }))

    waitForPage.then(() => setTimeout(finish, 1150))
    setTimeout(finish, 2400)
  }

  startBoot()
  document.addEventListener('pjax:complete', startBoot)
})()
