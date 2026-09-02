import { parseMetadata } from '/vendor/exiftool/index.js'
import {
  aggregateCameras,
  buildOverviewItems,
  extractShutterCount,
  formatFileSize,
  formatMetadataValue
} from '/js/raw-exif-core.mjs'

const root = document.getElementById('raw-exif-tool')

if (root) {
  const elements = {
    input: root.querySelector('#raw-file-input'),
    drop: root.querySelector('#raw-drop-zone'),
    status: root.querySelector('#raw-tool-status'),
    progress: root.querySelector('#raw-progress'),
    progressBar: root.querySelector('#raw-progress-bar'),
    actions: root.querySelector('#raw-actions'),
    clear: root.querySelector('#raw-clear'),
    export: root.querySelector('#raw-export'),
    summary: root.querySelector('#raw-summary'),
    fileCount: root.querySelector('#raw-file-count'),
    cameraCount: root.querySelector('#raw-camera-count'),
    shutterTotal: root.querySelector('#raw-shutter-total'),
    shutterNote: root.querySelector('#raw-shutter-note'),
    workspace: root.querySelector('#raw-workspace'),
    files: root.querySelector('#raw-files'),
    details: root.querySelector('#raw-details'),
    detailTitle: root.querySelector('#raw-detail-title'),
    detailMeta: root.querySelector('#raw-detail-meta'),
    overview: root.querySelector('#raw-overview'),
    search: root.querySelector('#raw-search'),
    group: root.querySelector('#raw-group'),
    rows: root.querySelector('#raw-tag-rows'),
    empty: root.querySelector('#raw-empty-tags')
  }

  const state = {
    records: [],
    selected: 0,
    processing: false
  }

  const supportedExtensions = new Set([
    '3fr', 'arw', 'cr2', 'cr3', 'dng', 'erf', 'fff', 'iiq', 'kdc', 'mef',
    'mos', 'mrw', 'nef', 'nrw', 'orf', 'pef', 'raf', 'raw', 'rw2', 'rwl',
    'sr2', 'srf', 'srw', 'x3f', 'heic', 'heif', 'jpeg', 'jpg', 'tif', 'tiff'
  ])

  const setText = (element, value) => {
    element.textContent = value
  }

  const create = (tag, className, text) => {
    const element = document.createElement(tag)
    if (className) element.className = className
    if (text !== undefined) setText(element, text)
    return element
  }

  const fileExtension = file => file.name.split('.').pop()?.toLowerCase() || ''

  const displayTagName = key => key.replace(/^.*:/, '')

  const groupName = key => key.includes(':') ? key.split(':', 1)[0] : 'Other'

  const renderSummary = () => {
    const successful = state.records.filter(record => record.metadata)
    const cameras = aggregateCameras(successful)
    const counts = cameras.filter(camera => camera.shutter !== null)

    setText(elements.fileCount, `${successful.length}`)
    setText(elements.cameraCount, `${cameras.length}`)

    if (counts.length === 1) {
      setText(elements.shutterTotal, counts[0].shutter.toLocaleString('zh-CN'))
      setText(elements.shutterNote, counts[0].method === 'combined' ? '机械 + 电子计数' : counts[0].label)
    } else if (counts.length > 1) {
      setText(elements.shutterTotal, `${counts.length} 台`)
      setText(elements.shutterNote, counts.map(camera => `${camera.label} · ${camera.shutter.toLocaleString('zh-CN')}`).join(' / '))
    } else {
      setText(elements.shutterTotal, '--')
      setText(elements.shutterNote, successful.length ? '文件未提供可识别的快门计数' : '等待解析')
    }
  }

  const renderFileList = () => {
    elements.files.replaceChildren()

    state.records.forEach((record, index) => {
      const item = create('li', 'raw-file-list__item')
      const button = create('button', 'raw-file-list__button')
      button.type = 'button'
      button.dataset.selected = index === state.selected ? 'true' : 'false'
      button.setAttribute('aria-pressed', index === state.selected ? 'true' : 'false')

      const icon = create('i', record.error ? 'fas fa-triangle-exclamation' : 'fas fa-file-image')
      icon.setAttribute('aria-hidden', 'true')
      const copy = create('span', 'raw-file-list__copy')
      copy.append(create('strong', '', record.file.name))
      copy.append(create('small', '', record.error ? '解析失败' : formatFileSize(record.file.size)))
      button.append(icon, copy)
      button.addEventListener('click', () => {
        state.selected = index
        renderFileList()
        renderDetails()
      })
      item.append(button)
      elements.files.append(item)
    })
  }

  const renderRows = () => {
    const record = state.records[state.selected]
    elements.rows.replaceChildren()
    if (!record?.metadata) {
      elements.empty.hidden = false
      return
    }

    const query = elements.search.value.trim().toLowerCase()
    const selectedGroup = elements.group.value
    const rows = Object.entries(record.metadata)
      .filter(([key, value]) => {
        const groupMatches = selectedGroup === 'all' || groupName(key) === selectedGroup
        const textMatches = !query || `${key} ${formatMetadataValue(value)}`.toLowerCase().includes(query)
        return groupMatches && textMatches
      })
      .sort(([left], [right]) => left.localeCompare(right))

    for (const [key, value] of rows) {
      const row = document.createElement('tr')
      const nameCell = document.createElement('td')
      const group = create('span', 'raw-tag-group', groupName(key))
      const name = create('span', 'raw-tag-name', displayTagName(key))
      nameCell.append(group, name)
      const valueCell = document.createElement('td')
      setText(valueCell, formatMetadataValue(value))
      row.append(nameCell, valueCell)
      elements.rows.append(row)
    }

    elements.empty.hidden = rows.length > 0
  }

  const renderGroupOptions = metadata => {
    const previous = elements.group.value || 'all'
    const groups = [...new Set(Object.keys(metadata).map(groupName))].sort()
    elements.group.replaceChildren()
    const all = document.createElement('option')
    all.value = 'all'
    setText(all, '全部分组')
    elements.group.append(all)
    for (const group of groups) {
      const option = document.createElement('option')
      option.value = group
      setText(option, group)
      elements.group.append(option)
    }
    elements.group.value = groups.includes(previous) ? previous : 'all'
  }

  const renderDetails = () => {
    const record = state.records[state.selected]
    if (!record) return

    setText(elements.detailTitle, record.file.name)
    setText(elements.detailMeta, `${formatFileSize(record.file.size)} · ${fileExtension(record.file).toUpperCase() || 'FILE'}`)
    elements.overview.replaceChildren()

    if (record.error) {
      const error = create('div', 'raw-tool__error')
      error.append(create('i', 'fas fa-triangle-exclamation'))
      error.append(create('span', '', record.error))
      elements.overview.append(error)
      renderGroupOptions({})
      renderRows()
      return
    }

    for (const [label, value] of buildOverviewItems(record.metadata)) {
      const item = create('div', 'raw-overview__item')
      item.append(create('span', '', label), create('strong', '', value))
      elements.overview.append(item)
    }

    renderGroupOptions(record.metadata)
    renderRows()
  }

  const render = () => {
    const hasRecords = state.records.length > 0
    elements.summary.hidden = !hasRecords
    elements.workspace.hidden = !hasRecords
    elements.actions.hidden = !hasRecords
    if (!hasRecords) return
    renderSummary()
    renderFileList()
    renderDetails()
  }

  const parseFile = async file => {
    const result = await parseMetadata(file, {
      args: ['-json', '-G1', '-a', '-s', '-n', '-api', 'LargeFileSupport=1'],
      fetch: () => fetch('/vendor/exiftool/zeroperl.wasm'),
      transform: JSON.parse
    })

    if (!result.success) throw new Error(result.error || 'ExifTool 无法解析此文件')
    return result.data?.[0] || {}
  }

  const processFiles = async fileList => {
    if (state.processing) return
    const files = [...fileList].filter(file => supportedExtensions.has(fileExtension(file)))
    if (!files.length) {
      setText(elements.status, '未找到支持的图像文件')
      elements.status.dataset.state = 'error'
      return
    }

    state.processing = true
    elements.input.disabled = true
    elements.progress.hidden = false
    elements.progressBar.style.width = '0%'
    elements.status.dataset.state = 'busy'
    state.records = []
    state.selected = 0
    render()

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      setText(elements.status, `解析中 ${index + 1}/${files.length} · ${file.name}`)
      try {
        const metadata = await parseFile(file)
        state.records.push({ file, metadata, error: null })
      } catch (error) {
        state.records.push({ file, metadata: null, error: error instanceof Error ? error.message : String(error) })
      }
      elements.progressBar.style.width = `${((index + 1) / files.length) * 100}%`
      render()
    }

    state.processing = false
    elements.input.disabled = false
    elements.status.dataset.state = 'ready'
    setText(elements.status, `${files.length} 个文件解析完成`)
    window.setTimeout(() => {
      elements.progress.hidden = true
    }, 500)
  }

  elements.input.addEventListener('change', event => processFiles(event.target.files))
  elements.search.addEventListener('input', renderRows)
  elements.group.addEventListener('change', renderRows)

  elements.clear.addEventListener('click', () => {
    state.records = []
    state.selected = 0
    elements.input.value = ''
    elements.search.value = ''
    setText(elements.status, 'READY')
    elements.status.dataset.state = 'ready'
    render()
  })

  elements.export.addEventListener('click', () => {
    const payload = state.records.filter(record => record.metadata).map(record => ({
      file: record.file.name,
      size: record.file.size,
      shutter: extractShutterCount(record.metadata),
      metadata: record.metadata
    }))
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `raw-exif-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  })

  for (const eventName of ['dragenter', 'dragover']) {
    elements.drop.addEventListener(eventName, event => {
      event.preventDefault()
      elements.drop.dataset.dragging = 'true'
    })
  }

  for (const eventName of ['dragleave', 'drop']) {
    elements.drop.addEventListener(eventName, event => {
      event.preventDefault()
      elements.drop.dataset.dragging = 'false'
    })
  }

  elements.drop.addEventListener('drop', event => processFiles(event.dataTransfer.files))
}
