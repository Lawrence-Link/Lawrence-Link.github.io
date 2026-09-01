(() => {
  const friends = [
    { name: '比格/Bigsk', url: 'https://blog.ianxia.com', icon: '/img/friendslink/bigsk.webp' },
    { name: '不大水龙', url: 'https://isluohui.netlify.app', icon: '/img/friendslink/budashuilong.png' },
    { name: '绀漓の锟斤拷', url: 'https://blog.sevtinge.com/friends', icon: '/img/friendslink/gl.png'},
    { name: '星诺StarNol', url: 'https://q-bot.cn', icon: '/img/friendslink/hajinuo.png' },
    { name: 'HoneyWhiteCloud', url: 'https://honeywhite.cloud', icon: '/img/friendslink/HoneyWhiteCloud.jpeg' },
    { name: '洺渊', url: 'https://blog.fmyron.com', icon: '/img/friendslink/mingyuan.jpg' },
    { name: '明宇', url: 'https://www.xming.cloud', icon: '/img/friendslink/tming.jpg'},
    { name: '猫喵', url: 'https://me0w.cat/', icon: '/img/friendslink/maomiao.jpg' },
    { name: 'wildcreator', url: 'https://wildcreator.top/', icon: '/img/friendslink/wildcreator.jpg' },
    { name: 'x1193', url: 'http://x1193.wikidot.com', icon: '/img/friendslink/X1193.png' },
    { name: '杨焱', url: 'https://yangyanot.top/', icon: '/img/friendslink/yangyan.jpeg' },
    { name: '渣渣120', url: 'https://zhazha120.cn', icon: '/img/friendslink/zhazha120.png' }
  ]

  const isHome = () => location.pathname === '/' || location.pathname === '/index.html'

  const escapeHtml = value => value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character])

  const friendMarkup = friend => {
    const name = escapeHtml(friend.name)
    const hostname = escapeHtml(new URL(friend.url).hostname.replace(/^www\./, ''))
    const avatar = friend.icon
      ? `<img class="home-friend__avatar" src="${friend.icon}" alt="" loading="lazy">`
      : `<span class="home-friend__fallback" aria-hidden="true">${escapeHtml(friend.name[0].toUpperCase())}</span>`

    return `
      <a class="home-friend" href="${friend.url}" target="_blank" rel="noopener noreferrer">
        ${avatar}
        <span class="home-friend__copy">
          <span class="home-friend__name">${name}</span>
          <span class="home-friend__host">${hostname}</span>
        </span>
        <i class="fas fa-external-link-alt home-friend__external" aria-hidden="true"></i>
      </a>`
  }

  const renderFriends = () => {
    document.getElementById('home-friends')?.remove()
    if (!isHome()) return

    const postList = document.querySelector('#recent-posts > .recent-post-items')
    if (!postList) return

    const section = document.createElement('section')
    section.id = 'home-friends'
    section.className = 'home-friends'
    section.setAttribute('aria-labelledby', 'home-friends-title')
    section.innerHTML = `
      <header class="home-friends__header">
        <div>
          <div class="home-friends__eyebrow">PEER NODES</div>
          <h2 class="home-friends__title" id="home-friends-title">友情链接</h2>
        </div>
        <div class="home-friends__status">${friends.length.toString().padStart(2, '0')} ONLINE</div>
      </header>
      <div class="home-friends__grid">
        ${friends.map(friendMarkup).join('')}
      </div>`

    postList.insertAdjacentElement('afterend', section)
  }

  renderFriends()
  document.addEventListener('DOMContentLoaded', renderFriends, { once: true })
  document.addEventListener('pjax:complete', renderFriends)
})()
