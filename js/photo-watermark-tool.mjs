import {
  createJpegRangeScanner,
  fitText,
  formatExposureBias,
  mapExifToFields,
  normalizeOrientation,
  orientedImageDimensions,
  outputDimensions,
  RAW_EXTENSIONS,
  wheelZoomFactor
} from '/js/photo-watermark-core.mjs'

const root = document.getElementById('photo-watermark-tool')

if (root) {
  const $ = selector => root.querySelector(selector)
  const elements = {
    file: $('#watermark-file'), drop: $('#watermark-drop'), status: $('#watermark-status'),
    canvas: $('#watermark-canvas'), canvasWrap: $('#watermark-canvas-wrap'), placeholder: $('#watermark-placeholder'),
    zoomOut: $('#watermark-zoom-out'), zoomIn: $('#watermark-zoom-in'), zoomFit: $('#watermark-zoom-fit'), zoomValue: $('#watermark-zoom-value'),
    brand: $('#watermark-brand'), logoSize: $('#watermark-logo-size'), logoSizeValue: $('#watermark-logo-size-value'),
    svg: $('#watermark-svg'), svgWrap: $('#watermark-svg-wrap'),
    camera: $('#watermark-camera'), lens: $('#watermark-lens'), focal: $('#watermark-focal'), aperture: $('#watermark-aperture'),
    shutter: $('#watermark-shutter'), iso: $('#watermark-iso'), bias: $('#watermark-bias'), biasValue: $('#watermark-bias-value'), date: $('#watermark-date'),
    bar: $('#watermark-bar'), barValue: $('#watermark-bar-value'), frame: $('#watermark-frame'), frameValue: $('#watermark-frame-value'),
    font: $('#watermark-font'), fontSize: $('#watermark-font-size'), fontSizeValue: $('#watermark-font-size-value'),
    background: $('#watermark-background'), foreground: $('#watermark-foreground'), invert: $('#watermark-invert'),
    resolution: $('#watermark-resolution'), download: $('#watermark-download')
  }
  const context = elements.canvas.getContext('2d', { alpha: false })
  const state = { image: null, orientation: 1, sourceName: 'photo', customLogo: null, customLogoUrl: '', brandLogos: new Map(), renderToken: 0, hasBias: false, zoom: 1, panX: 0, panY: 0, pointer: null }
  const brandLabels = { none: '', nikon: 'NIKON', sony: 'SONY', canon: 'Canon', fujifilm: 'FUJIFILM', leica: 'Leica', hasselblad: 'HASSELBLAD', apple: 'APPLE', xiaomi: 'XIAOMI', text: '' }
  const logoBrands = new Set(['nikon', 'sony', 'canon', 'fujifilm', 'leica', 'hasselblad', 'apple', 'xiaomi'])

  const setStatus = (text, status = 'ready') => {
    elements.status.textContent = text
    elements.status.dataset.state = status
  }

  const selectedValue = name => root.querySelector(`input[name="${name}"]:checked`)?.value

  const applyPreviewTransform = () => {
    elements.canvas.style.setProperty('--watermark-preview-zoom', state.zoom)
    elements.canvas.style.setProperty('--watermark-pan-x', `${state.panX}px`)
    elements.canvas.style.setProperty('--watermark-pan-y', `${state.panY}px`)
    elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`
    elements.zoomOut.disabled = !state.image || state.zoom <= 0.5
    elements.zoomIn.disabled = !state.image || state.zoom >= 4
    elements.zoomFit.disabled = !state.image || (state.zoom === 1 && state.panX === 0 && state.panY === 0)
  }

  const setPreviewZoom = (zoom, clientX, clientY) => {
    if (!state.image) return
    const nextZoom = Math.min(4, Math.max(0.5, zoom))
    if (nextZoom === state.zoom) return
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const bounds = elements.canvasWrap.getBoundingClientRect()
      const offsetX = clientX - (bounds.left + bounds.width / 2)
      const offsetY = clientY - (bounds.top + bounds.height / 2)
      const ratio = nextZoom / state.zoom
      state.panX = offsetX - (offsetX - state.panX) * ratio
      state.panY = offsetY - (offsetY - state.panY) * ratio
    }
    state.zoom = nextZoom
    applyPreviewTransform()
  }

  const resetPreviewZoom = () => {
    state.zoom = 1
    state.panX = 0
    state.panY = 0
    applyPreviewTransform()
  }

  const fileExtension = file => file.name.split('.').pop()?.toLowerCase() || ''

  const isRawFile = file => RAW_EXTENSIONS.has(fileExtension(file))

  const readState = () => ({
    mode: selectedValue('watermark-mode') || 'card',
    barRatio: Number(elements.bar.value) / 100,
    frameRatio: Number(elements.frame.value) / 100,
    brand: elements.brand.value,
    logoScale: Number(elements.logoSize.value) / 100,
    camera: elements.camera.value.trim(), lens: elements.lens.value.trim(),
    focal: elements.focal.value.trim(), aperture: elements.aperture.value.trim(), shutter: elements.shutter.value.trim(), iso: elements.iso.value.trim(),
    bias: state.hasBias ? Number(elements.bias.value) : null, date: elements.date.value.trim(),
    font: elements.font.value, fontScale: Number(elements.fontSize.value) / 100,
    background: elements.background.value, foreground: elements.foreground.value
  })

  const roundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, radius)
    ctx.fill()
  }

  const relativeLuminance = hex => {
    const channels = hex.match(/[a-f\d]{2}/gi)?.map(value => Number.parseInt(value, 16) / 255) || [1, 1, 1]
    return channels.reduce((sum, channel, index) => sum + (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index], 0)
  }

  const brandColor = settings => {
    if (settings.mode === 'overlay') return '#ffffff'
    const darkBackground = relativeLuminance(settings.background) < 0.22
    const colors = { canon: '#bf1920', fujifilm: '#fb0020', leica: '#e20612', xiaomi: '#ff6900' }
    if (colors[settings.brand]) return colors[settings.brand]
    if (settings.brand === 'nikon') return darkBackground ? '#ffe100' : '#111317'
    if (settings.brand === 'hasselblad') return darkBackground ? '#ffffff' : '#0c3c60'
    return darkBackground ? '#ffffff' : '#111317'
  }

  const loadBrandLogo = brand => {
    if (!logoBrands.has(brand) || state.brandLogos.has(brand)) return
    state.brandLogos.set(brand, null)
    const image = new Image()
    image.onload = () => { state.brandLogos.set(brand, image); render() }
    image.onerror = () => state.brandLogos.delete(brand)
    image.src = `/img/photo-watermark/brands/${brand}.svg`
  }

  const drawTintedLogo = (image, x, centerY, maxWidth, targetHeight, color) => {
    const ratio = image.naturalWidth / image.naturalHeight || 2
    const height = Math.min(targetHeight, maxWidth / ratio)
    const width = height * ratio
    const buffer = document.createElement('canvas')
    buffer.width = Math.max(1, Math.ceil(width))
    buffer.height = Math.max(1, Math.ceil(height))
    const bufferContext = buffer.getContext('2d')
    bufferContext.drawImage(image, 0, 0, buffer.width, buffer.height)
    bufferContext.globalCompositeOperation = 'source-in'
    bufferContext.fillStyle = color
    bufferContext.fillRect(0, 0, buffer.width, buffer.height)
    context.drawImage(buffer, x, centerY - height / 2, width, height)
    return width
  }

  const drawBrand = (settings, x, centerY, maxWidth, scale, color) => {
    if (settings.brand === 'none' || (settings.brand === 'text' && !settings.camera)) return 0
    const logoHeight = 38 * scale * settings.logoScale
    if (settings.brand === 'custom' && state.customLogo) {
      const ratio = state.customLogo.naturalWidth / state.customLogo.naturalHeight || 2
      const height = Math.min(logoHeight, maxWidth / ratio)
      const width = height * ratio
      context.drawImage(state.customLogo, x, centerY - height / 2, width, height)
      return width
    }

    const brandLogo = state.brandLogos.get(settings.brand)
    if (brandLogo) return drawTintedLogo(brandLogo, x, centerY, maxWidth, logoHeight, brandColor(settings))

    const label = brandLabels[settings.brand] || settings.camera.split(/\s+/)[0] || ''
    if (!label) return 0
    context.save()
    context.fillStyle = color
    context.font = `800 ${20 * scale}px ${settings.font}`
    const logoSize = fitText(context, label, maxWidth, 20 * scale, 8 * scale)
    context.font = `800 ${logoSize}px ${settings.font}`
    const textWidth = context.measureText(label).width
    if (settings.brand === 'nikon' || settings.brand === 'xiaomi') {
      const pad = 7 * scale
      context.fillStyle = settings.brand === 'nikon' ? '#f5d20a' : '#f56600'
      roundedRect(context, x, centerY - logoHeight / 2, textWidth + pad * 2, logoHeight, 2 * scale)
      context.fillStyle = settings.brand === 'nikon' ? '#111317' : '#ffffff'
      context.textBaseline = 'middle'
      context.fillText(label, x + pad, centerY)
      context.restore()
      return textWidth + pad * 2
    }
    context.textBaseline = 'middle'
    context.fillText(label, x, centerY)
    context.restore()
    return textWidth
  }

  const drawOrientedImage = (image, orientation, x, y) => {
    const width = image.naturalWidth
    const height = image.naturalHeight
    const transforms = {
      2: [-1, 0, 0, 1, width, 0],
      3: [-1, 0, 0, -1, width, height],
      4: [1, 0, 0, -1, 0, height],
      5: [0, 1, 1, 0, 0, 0],
      6: [0, 1, -1, 0, height, 0],
      7: [0, -1, -1, 0, height, width],
      8: [0, -1, 1, 0, 0, width]
    }
    context.save()
    context.translate(x, y)
    if (transforms[orientation]) context.transform(...transforms[orientation])
    context.drawImage(image, 0, 0, width, height)
    context.restore()
  }

  const drawMetadata = settings => {
    const image = state.image
    const imageDimensions = orientedImageDimensions(image.naturalWidth, image.naturalHeight, state.orientation)
    const dimensions = outputDimensions(imageDimensions.width, imageDimensions.height, settings.mode, settings.barRatio, settings.frameRatio)
    elements.canvas.width = dimensions.width
    elements.canvas.height = dimensions.height

    const { width, height, frame, bar } = dimensions
    const scale = width / 1600
    const pad = Math.max(18, 48 * scale)
    context.fillStyle = settings.background
    context.fillRect(0, 0, width, height)
    drawOrientedImage(image, state.orientation, frame, frame)

    const overlay = settings.mode === 'overlay'
    const contentY = overlay ? height - Math.max(112 * scale, height * 0.14) : height - bar
    const contentHeight = overlay ? height - contentY : bar
    const textColor = overlay ? '#ffffff' : settings.foreground
    const mutedColor = overlay ? 'rgba(255,255,255,.76)' : `${settings.foreground}a8`
    const left = (overlay ? 0 : frame) + pad
    const right = width - (overlay ? 0 : frame) - pad

    if (overlay) {
      const gradient = context.createLinearGradient(0, contentY - 80 * scale, 0, height)
      gradient.addColorStop(0, 'rgba(0,0,0,0)')
      gradient.addColorStop(1, 'rgba(0,0,0,.72)')
      context.fillStyle = gradient
      context.fillRect(0, contentY - 80 * scale, width, height - contentY + 80 * scale)
    }

    const lineOneY = contentY + contentHeight * 0.43
    const lineTwoY = contentY + contentHeight * 0.7
    const logoWidth = drawBrand(settings, left, lineOneY, width * 0.25, scale, textColor)
    const identityX = left + logoWidth + (logoWidth ? 22 * scale : 0)
    const middle = width * 0.52

    context.textBaseline = 'middle'
    context.textAlign = 'left'
    context.fillStyle = textColor
    context.font = `700 ${20 * scale * settings.fontScale}px ${settings.font}`
    const cameraSize = fitText(context, settings.camera, middle - identityX - pad, 20 * scale * settings.fontScale, 8 * scale)
    context.font = `700 ${cameraSize}px ${settings.font}`
    if (settings.camera) context.fillText(settings.camera, identityX, lineOneY)

    context.fillStyle = mutedColor
    context.font = `400 ${13 * scale * settings.fontScale}px ${settings.font}`
    const lensSize = fitText(context, settings.lens, middle - identityX - pad, 13 * scale * settings.fontScale, 7 * scale)
    context.font = `400 ${lensSize}px ${settings.font}`
    if (settings.lens) context.fillText(settings.lens, identityX, lineTwoY)

    context.textAlign = 'right'
    context.fillStyle = textColor
    const exposure = [settings.focal, settings.aperture, settings.shutter, settings.iso].filter(Boolean).join('  ')
    context.font = `700 ${22 * scale * settings.fontScale}px ${settings.font}`
    const exposureSize = fitText(context, exposure, right - middle, 22 * scale * settings.fontScale, 8 * scale)
    context.font = `700 ${exposureSize}px ${settings.font}`
    if (exposure) context.fillText(exposure, right, lineOneY)

    context.fillStyle = mutedColor
    const secondary = [settings.date, formatExposureBias(settings.bias)].filter(Boolean).join('  |  ')
    context.font = `400 ${13 * scale * settings.fontScale}px ${settings.font}`
    const secondarySize = fitText(context, secondary, right - middle, 13 * scale * settings.fontScale, 7 * scale)
    context.font = `400 ${secondarySize}px ${settings.font}`
    if (secondary) context.fillText(secondary, right, lineTwoY)
    elements.resolution.textContent = `${width.toLocaleString()} × ${height.toLocaleString()} px`
  }

  const render = () => {
    if (!state.image) return
    const token = ++state.renderToken
    requestAnimationFrame(() => {
      if (token !== state.renderToken || !state.image) return
      drawMetadata(readState())
    })
  }

  const loadImage = file => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('浏览器无法解码这张图片')) }
    image.src = url
  })

  const scanFileForJpegs = async file => {
    const scanner = createJpegRangeScanner()
    if (typeof file.stream === 'function') {
      const reader = file.stream().getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          scanner.push(value)
        }
      } finally {
        reader.releaseLock()
      }
    } else {
      const chunkSize = 4 * 1024 * 1024
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        scanner.push(new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()))
      }
    }
    return scanner.ranges
  }

  const loadRawPreview = async file => {
    const candidates = (await scanFileForJpegs(file))
      .filter(range => range.size >= 1024)
      .sort((left, right) => right.size - left.size)

    let bestPreview = null
    let bestPreviewBlob = null
    let bestPixels = 0
    for (const range of candidates.slice(0, 12)) {
      try {
        const preview = file.slice(range.start, range.end, 'image/jpeg')
        const image = await loadImage(preview)
        const pixels = image.naturalWidth * image.naturalHeight
        if (pixels > bestPixels) {
          bestPreview = image
          bestPreviewBlob = preview
          bestPixels = pixels
        }
      } catch {}
    }
    if (bestPreview) {
      let embeddedOrientation = 1
      if (window.ExifReader && bestPreviewBlob) {
        try {
          const previewBuffer = await bestPreviewBlob.arrayBuffer()
          const previewTags = await window.ExifReader.load(previewBuffer)
          embeddedOrientation = normalizeOrientation(previewTags.Orientation)
        } catch {}
      }
      return { image: bestPreview, embeddedOrientation }
    }
    throw new Error('该 RAW 文件没有浏览器可解码的内嵌 JPEG 预览')
  }

  const parseRawMetadata = async file => {
    const { parseMetadata } = await import('/vendor/exiftool/index.js')
    const result = await parseMetadata(file, {
      args: ['-json', '-s', '-n', '-api', 'LargeFileSupport=1'],
      fetch: () => fetch('/vendor/exiftool/zeroperl.wasm'),
      transform: JSON.parse
    })
    if (!result.success) throw new Error(result.error || 'RAW EXIF 解析失败')
    return result.data?.[0] || {}
  }

  const loadPhoto = async file => {
    if (!file) return
    const raw = isRawFile(file)
    if (!raw && !file.type.startsWith('image/')) return setStatus('INVALID FILE / 文件无效', 'error')
    setStatus(raw ? 'READING RAW / 解析 RAW' : 'READING EXIF / 读取中', 'busy')
    try {
      const [imageResult, tags] = raw
        ? await Promise.all([loadRawPreview(file), parseRawMetadata(file).catch(() => ({}))])
        : await Promise.all([
            loadImage(file),
            window.ExifReader ? window.ExifReader.load(file).catch(() => ({})) : Promise.resolve({})
          ])
      state.image = raw ? imageResult.image : imageResult
      const rawOrientation = normalizeOrientation(tags.Orientation)
      state.orientation = raw && imageResult.embeddedOrientation === 1 ? rawOrientation : 1
      state.sourceName = file.name.replace(/\.[^.]+$/, '') || 'photo'
      resetPreviewZoom()
      const fields = mapExifToFields(tags)
      elements.brand.value = fields.brand
      elements.camera.value = fields.camera
      elements.lens.value = fields.lens
      elements.focal.value = fields.focalLength
      elements.aperture.value = fields.aperture
      elements.shutter.value = fields.shutter
      elements.iso.value = fields.iso
      state.hasBias = fields.bias !== null
      elements.bias.value = String(fields.bias ?? 0)
      elements.biasValue.textContent = formatExposureBias(fields.bias)
      elements.date.value = fields.date
      loadBrandLogo(fields.brand)
      elements.svgWrap.hidden = fields.brand !== 'custom'
      elements.canvasWrap.dataset.empty = 'false'
      elements.placeholder.hidden = true
      elements.download.disabled = false
      render()
      const hasMappedExif = fields.camera || fields.lens || fields.focalLength || fields.aperture || fields.shutter || fields.iso || fields.date
      setStatus(raw ? 'RAW PREVIEW / RAW 预览' : hasMappedExif ? 'EXIF LOADED / 已读取' : 'PHOTO LOADED / 已载入')
    } catch (error) {
      setStatus('LOAD FAILED / 载入失败', 'error')
      elements.resolution.textContent = error.message
    }
  }

  const loadCustomLogo = async file => {
    if (!file || file.type !== 'image/svg+xml' || file.size > 1024 * 1024) {
      setStatus('SVG REQUIRED / 需要 SVG', 'error')
      return
    }
    const documentNode = new DOMParser().parseFromString(await file.text(), 'image/svg+xml')
    const svg = documentNode.documentElement
    if (svg.localName !== 'svg' || documentNode.querySelector('parsererror')) {
      setStatus('INVALID SVG / SVG 无效', 'error')
      return
    }
    documentNode.querySelectorAll('script, foreignObject').forEach(node => node.remove())
    documentNode.querySelectorAll('*').forEach(node => {
      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase()
        const value = attribute.value.trim().toLowerCase()
        if (name.startsWith('on') || ((name === 'href' || name.endsWith(':href')) && !value.startsWith('#') && !value.startsWith('data:image/'))) {
          node.removeAttribute(attribute.name)
        }
      }
    })
    if (state.customLogoUrl) URL.revokeObjectURL(state.customLogoUrl)
    const sanitized = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    state.customLogoUrl = URL.createObjectURL(sanitized)
    const image = new Image()
    image.onload = () => { state.customLogo = image; render(); setStatus('LOGO LOADED / Logo 已载入') }
    image.onerror = () => setStatus('LOGO FAILED / Logo 无法读取', 'error')
    image.src = state.customLogoUrl
  }

  for (const eventName of ['dragenter', 'dragover']) {
    elements.drop.addEventListener(eventName, event => { event.preventDefault(); elements.drop.dataset.dragging = 'true' })
  }
  for (const eventName of ['dragleave', 'drop']) {
    elements.drop.addEventListener(eventName, event => { event.preventDefault(); elements.drop.dataset.dragging = 'false' })
  }
  elements.drop.addEventListener('drop', event => loadPhoto(event.dataTransfer.files[0]))
  elements.file.addEventListener('change', () => loadPhoto(elements.file.files[0]))
  elements.svg.addEventListener('change', () => loadCustomLogo(elements.svg.files[0]))

  root.addEventListener('input', event => {
    if (event.target === elements.bar) elements.barValue.textContent = `${elements.bar.value}%`
    if (event.target === elements.frame) elements.frameValue.textContent = `${elements.frame.value}%`
    if (event.target === elements.fontSize) elements.fontSizeValue.textContent = `${elements.fontSize.value}%`
    if (event.target === elements.logoSize) elements.logoSizeValue.textContent = `${elements.logoSize.value}%`
    if (event.target === elements.bias) {
      state.hasBias = true
      elements.biasValue.textContent = formatExposureBias(elements.bias.value)
    }
    render()
  })
  root.addEventListener('change', event => {
    if (event.target === elements.brand) {
      elements.svgWrap.hidden = elements.brand.value !== 'custom'
      loadBrandLogo(elements.brand.value)
    }
    render()
  })
  elements.invert.addEventListener('click', () => {
    const background = elements.background.value
    elements.background.value = elements.foreground.value
    elements.foreground.value = background
    render()
  })
  elements.zoomOut.addEventListener('click', () => setPreviewZoom(state.zoom - 0.25))
  elements.zoomIn.addEventListener('click', () => setPreviewZoom(state.zoom + 0.25))
  elements.zoomFit.addEventListener('click', resetPreviewZoom)
  elements.canvasWrap.addEventListener('wheel', event => {
    if (!state.image) return
    event.preventDefault()
    const factor = wheelZoomFactor(event.deltaY, event.deltaMode, elements.canvasWrap.clientHeight, event.ctrlKey)
    setPreviewZoom(state.zoom * factor, event.clientX, event.clientY)
  }, { passive: false })
  elements.canvas.addEventListener('pointerdown', event => {
    if (!state.image) return
    state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY }
    elements.canvas.setPointerCapture(event.pointerId)
    elements.canvasWrap.dataset.panning = 'true'
  })
  elements.canvas.addEventListener('pointermove', event => {
    if (!state.pointer || state.pointer.id !== event.pointerId) return
    state.panX = state.pointer.panX + event.clientX - state.pointer.x
    state.panY = state.pointer.panY + event.clientY - state.pointer.y
    applyPreviewTransform()
  })
  const stopPanning = event => {
    if (!state.pointer || state.pointer.id !== event.pointerId) return
    state.pointer = null
    delete elements.canvasWrap.dataset.panning
  }
  elements.canvas.addEventListener('pointerup', stopPanning)
  elements.canvas.addEventListener('pointercancel', stopPanning)
  elements.download.addEventListener('click', () => {
    if (!state.image) return
    setStatus('EXPORTING / 导出中', 'busy')
    const format = selectedValue('watermark-format') || 'jpeg'
    const mime = format === 'png' ? 'image/png' : 'image/jpeg'
    elements.canvas.toBlob(blob => {
      if (!blob) return setStatus('EXPORT FAILED / 导出失败', 'error')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${state.sourceName}_watermark.${format === 'png' ? 'png' : 'jpg'}`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('DOWNLOADED / 已下载')
    }, mime, format === 'png' ? undefined : 0.95)
  })

  context.fillStyle = '#15181d'
  context.fillRect(0, 0, elements.canvas.width, elements.canvas.height)
  applyPreviewTransform()
  loadBrandLogo(elements.brand.value)
}
