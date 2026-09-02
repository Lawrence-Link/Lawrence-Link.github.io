const DIRECT_SHUTTER_TAGS = [
  'TotalNumberOfShutterReleasesForCamera',
  'TotalShutterReleases',
  'ShutterCount',
  'ShutterCounter',
  'CameraActuations',
  'ActuationCount',
  'ReleaseCount',
  'ImageCount'
]

const MECHANICAL_SHUTTER_TAGS = [
  'MechanicalShutterCount',
  'MechanicalShutterCounter'
]

const ELECTRONIC_SHUTTER_TAGS = [
  'ElectronicShutterCount',
  'ElectronicShutterCounter'
]

export const normalizeTagName = name => name
  .split(':')
  .pop()
  .replace(/\s*\(\d+\)$/, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()

const counterValue = value => {
  const candidate = Array.isArray(value) ? value[0] : value
  const parsed = typeof candidate === 'number'
    ? candidate
    : Number(String(candidate).replace(/[\s,]/g, ''))

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

const findTag = (metadata, names) => {
  const wanted = new Set(names.map(normalizeTagName))

  for (const [key, value] of Object.entries(metadata)) {
    const normalized = normalizeTagName(key)
    const group = key.includes(':') ? key.split(':', 1)[0].toLowerCase() : ''
    if (!wanted.has(normalized)) continue
    if (normalized === 'imagecount' && ['file', 'quicktime', 'track1', 'composite', 'system'].includes(group)) continue
    const count = counterValue(value)
    if (count !== null) return { key, value: count }
  }

  return null
}

export const getTag = (metadata, names) => {
  const wanted = new Set(names.map(normalizeTagName))
  const match = Object.entries(metadata).find(([key]) => wanted.has(normalizeTagName(key)))
  return match?.[1] ?? null
}

const dimensionValue = value => {
  const candidate = Array.isArray(value) ? value[0] : value
  const parsed = typeof candidate === 'number'
    ? candidate
    : Number(String(candidate).replace(/[\s,]/g, ''))

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

const dimensionGroup = key => key.includes(':') ? key.split(':', 1)[0] : ''

export const extractImageDimensions = metadata => {
  const pairs = new Map()

  for (const [key, value] of Object.entries(metadata)) {
    const name = normalizeTagName(key)
    const side = ['exifimagewidth', 'pixelxdimension', 'imagewidth'].includes(name)
      ? 'width'
      : ['exifimageheight', 'pixelydimension', 'imageheight'].includes(name)
          ? 'height'
          : null
    if (!side) continue

    const parsed = dimensionValue(value)
    if (parsed === null) continue

    const group = dimensionGroup(key)
    const family = name.startsWith('exifimage') || name.startsWith('pixel') ? 'exif' : 'image'
    const pairKey = `${group}\u0000${family}`
    const pair = pairs.get(pairKey) || { group, family, width: null, height: null }
    pair[side] = parsed
    pairs.set(pairKey, pair)
  }

  const candidates = [...pairs.values()].filter(pair => pair.width && pair.height)
  if (!candidates.length) return null

  candidates.sort((left, right) => {
    const familyDifference = Number(right.family === 'exif') - Number(left.family === 'exif')
    if (familyDifference) return familyDifference
    return (right.width * right.height) - (left.width * left.height)
  })

  const { width, height } = candidates[0]
  return { width, height }
}

export const formatMetadataValue = value => {
  if (value === null || value === undefined || value === '') return '--'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const numericTagValue = value => {
  const candidate = Array.isArray(value) ? value[0] : value
  if (candidate === null || candidate === undefined || candidate === '') return null
  const parsed = Number(candidate)
  return Number.isFinite(parsed) ? parsed : null
}

const formatExposureTime = value => {
  const numeric = numericTagValue(value)
  if (numeric === null || numeric <= 0) return formatMetadataValue(value)
  if (numeric < 1) return `1/${Math.round(1 / numeric)} s`
  return `${Number(numeric.toFixed(3))} s`
}

const formatAperture = value => {
  const numeric = numericTagValue(value)
  return numeric === null ? formatMetadataValue(value) : `f/${Number(numeric.toFixed(2))}`
}

const formatFocalLength = value => {
  const numeric = numericTagValue(value)
  return numeric === null ? formatMetadataValue(value) : `${Number(numeric.toFixed(1))} mm`
}

const formatExposureCompensation = value => {
  const numeric = numericTagValue(value)
  if (numeric === null) return formatMetadataValue(value)
  const rounded = Number(numeric.toFixed(2))
  return `${rounded > 0 ? '+' : ''}${rounded} EV`
}

const formatExifDate = value => String(value).replace(
  /^(\d{4}):(\d{2}):(\d{2})(?:[ T])?/,
  '$1-$2-$3 '
).trim()

const formatCode = (value, labels) => {
  const numeric = numericTagValue(value)
  return numeric !== null && labels[numeric] ? labels[numeric] : formatMetadataValue(value)
}

const formatLensInfo = value => {
  const values = (Array.isArray(value) ? value : String(value).match(/\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter(Number.isFinite)
  if (values.length < 4) return formatMetadataValue(value)

  const [minFocal, maxFocal, minAperture, maxAperture] = values
  const focal = minFocal === maxFocal ? `${minFocal} mm` : `${minFocal}-${maxFocal} mm`
  const aperture = minAperture === maxAperture ? `f/${minAperture}` : `f/${minAperture}-${maxAperture}`
  return `${focal} · ${aperture}`
}

const EXPOSURE_PROGRAMS = {
  0: '未定义',
  1: '手动',
  2: '程序自动',
  3: '光圈优先',
  4: '快门优先',
  5: '创意程序',
  6: '动作程序',
  7: '人像',
  8: '风景'
}

const EXPOSURE_MODES = { 0: '自动', 1: '手动', 2: '自动包围' }
const METERING_MODES = {
  0: '未知',
  1: '平均测光',
  2: '中央重点平均',
  3: '点测光',
  4: '多点测光',
  5: '多区测光',
  6: '局部测光',
  255: '其他'
}
const WHITE_BALANCE_MODES = { 0: '自动', 1: '手动' }
const COLOR_SPACES = { 1: 'sRGB', 2: 'Adobe RGB', 65535: '未标定' }
const ORIENTATIONS = {
  1: '水平',
  2: '水平镜像',
  3: '旋转 180°',
  4: '垂直镜像',
  5: '镜像并旋转 90°',
  6: '顺时针 90°',
  7: '镜像并旋转 270°',
  8: '逆时针 90°'
}

export const buildOverviewItems = metadata => {
  const shutter = extractShutterCount(metadata)
  const identity = cameraIdentity(metadata)
  const dimensions = extractImageDimensions(metadata)
  const items = [
    ['机身', identity.label],
    ['序列号', identity.serial || '--'],
    ['镜头', formatMetadataValue(getTag(metadata, ['LensModel', 'LensID']))],
    ['快门计数', shutter.value === null ? '--' : shutter.value.toLocaleString('zh-CN')],
    ['快门速度', formatExposureTime(getTag(metadata, ['ExposureTime']))],
    ['光圈', formatAperture(getTag(metadata, ['FNumber', 'Aperture']))],
    ['ISO', formatMetadataValue(getTag(metadata, ['ISO', 'ISOSetting']))],
    ['焦距', formatFocalLength(getTag(metadata, ['FocalLength']))],
    ['拍摄时间', formatExifDate(getTag(metadata, ['DateTimeOriginal', 'CreateDate']) ?? '--')],
    ['尺寸', dimensions ? `${dimensions.width} × ${dimensions.height}` : '--']
  ]

  const optional = (label, names, formatter = formatMetadataValue) => {
    const value = getTag(metadata, names)
    if (value !== null && value !== '') items.push([label, formatter(value)])
  }

  optional('镜头规格', ['LensInfo', 'LensSpecification'], formatLensInfo)
  optional('等效焦距', ['FocalLengthIn35mmFormat', 'FocalLengthIn35mmFilm'], formatFocalLength)
  optional('曝光补偿', ['ExposureCompensation', 'ExposureBiasValue'], formatExposureCompensation)

  const exposureProgram = getTag(metadata, ['ExposureProgram'])
  if (exposureProgram !== null) {
    items.push(['拍摄模式', formatCode(exposureProgram, EXPOSURE_PROGRAMS)])
  } else {
    optional('拍摄模式', ['ExposureMode'], value => formatCode(value, EXPOSURE_MODES))
  }

  optional('测光模式', ['MeteringMode'], value => formatCode(value, METERING_MODES))
  optional('白平衡', ['WhiteBalance'], value => formatCode(value, WHITE_BALANCE_MODES))
  optional('色彩空间', ['ColorSpace'], value => formatCode(value, COLOR_SPACES))
  optional('方向', ['Orientation'], value => formatCode(value, ORIENTATIONS))
  optional('处理软件', ['Software'])

  return items
}

export const extractShutterCount = metadata => {
  const direct = findTag(metadata, DIRECT_SHUTTER_TAGS)
  if (direct) {
    return {
      value: direct.value,
      method: 'reported',
      sources: [direct]
    }
  }

  const mechanical = findTag(metadata, MECHANICAL_SHUTTER_TAGS)
  const electronic = findTag(metadata, ELECTRONIC_SHUTTER_TAGS)

  if (mechanical && electronic) {
    return {
      value: mechanical.value + electronic.value,
      method: 'combined',
      sources: [mechanical, electronic]
    }
  }

  return {
    value: null,
    method: 'unavailable',
    sources: [mechanical, electronic].filter(Boolean)
  }
}

export const cameraIdentity = metadata => {
  const make = getTag(metadata, ['Make'])
  const model = getTag(metadata, ['Model', 'CameraModelName'])
  const serial = getTag(metadata, ['BodySerialNumber', 'CameraSerialNumber', 'SerialNumber'])
  const label = [make, model].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || '未知机身'

  return {
    label,
    serial: serial ? String(serial) : '',
    key: `${label}\u0000${serial || ''}`
  }
}

export const aggregateCameras = records => {
  const cameras = new Map()

  for (const record of records) {
    if (!record.metadata) continue
    const identity = cameraIdentity(record.metadata)
    const shutter = extractShutterCount(record.metadata)
    const current = cameras.get(identity.key) || {
      ...identity,
      files: 0,
      shutter: null,
      method: 'unavailable'
    }

    current.files += 1
    if (shutter.value !== null && (current.shutter === null || shutter.value > current.shutter)) {
      current.shutter = shutter.value
      current.method = shutter.method
    }
    cameras.set(identity.key, current)
  }

  return [...cameras.values()]
}

export const formatFileSize = bytes => {
  if (!Number.isFinite(bytes) || bytes < 0) return '--'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}
