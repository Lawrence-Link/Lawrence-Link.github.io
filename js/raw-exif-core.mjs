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
  0: 'Undefined / 未定义',
  1: 'Manual / 手动',
  2: 'Program AE / 程序自动',
  3: 'Aperture priority / 光圈优先',
  4: 'Shutter priority / 快门优先',
  5: 'Creative program / 创意程序',
  6: 'Action program / 动作程序',
  7: 'Portrait / 人像',
  8: 'Landscape / 风景'
}

const EXPOSURE_MODES = { 0: 'Auto / 自动', 1: 'Manual / 手动', 2: 'Auto bracket / 自动包围' }
const METERING_MODES = {
  0: 'Unknown / 未知',
  1: 'Average / 平均测光',
  2: 'Center-weighted average / 中央重点平均',
  3: 'Spot / 点测光',
  4: 'Multi-spot / 多点测光',
  5: 'Multi-segment / 多区测光',
  6: 'Partial / 局部测光',
  255: 'Other / 其他'
}
const WHITE_BALANCE_MODES = { 0: 'Auto / 自动', 1: 'Manual / 手动' }
const COLOR_SPACES = { 1: 'sRGB', 2: 'Adobe RGB', 65535: 'Uncalibrated / 未标定' }
const ORIENTATIONS = {
  1: 'Horizontal / 水平',
  2: 'Mirror horizontal / 水平镜像',
  3: 'Rotate 180° / 旋转 180°',
  4: 'Mirror vertical / 垂直镜像',
  5: 'Mirror + rotate 90° / 镜像并旋转 90°',
  6: 'Rotate 90° CW / 顺时针 90°',
  7: 'Mirror + rotate 270° / 镜像并旋转 270°',
  8: 'Rotate 90° CCW / 逆时针 90°'
}

export const gradeShutterCount = (count, maximum) => {
  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(maximum) || maximum <= 0) return null
  const ratio = count / maximum
  const grade = ratio <= 0.25 ? 'A' : ratio <= 0.5 ? 'B' : ratio <= 0.75 ? 'C' : 'D'
  const labels = {
    A: 'Excellent / 优秀',
    B: 'Good / 良好',
    C: 'Attention / 留意',
    D: 'Near or over limit / 接近或超过上限'
  }
  return { grade, ratio, label: labels[grade] }
}

export const buildOverviewItems = (metadata, maximumShutterCount = 200000) => {
  const shutter = extractShutterCount(metadata)
  const shutterGrade = gradeShutterCount(shutter.value, maximumShutterCount)
  const identity = cameraIdentity(metadata)
  const dimensions = extractImageDimensions(metadata)
  const items = [
    ['Camera / 机身', identity.label],
    ['Serial number / 序列号', identity.serial || '--'],
    ['Lens / 镜头', formatMetadataValue(getTag(metadata, ['LensModel', 'LensID']))],
    ['Shutter count / 快门计数', shutter.value === null ? '--' : shutter.value.toLocaleString('zh-CN')],
    ['Shutter grade / 快门评级', shutterGrade ? `${shutterGrade.grade} · ${shutterGrade.label} · ${(shutterGrade.ratio * 100).toFixed(1)}%` : '--'],
    ['Shutter speed / 快门速度', formatExposureTime(getTag(metadata, ['ExposureTime']))],
    ['Aperture / 光圈', formatAperture(getTag(metadata, ['FNumber', 'Aperture']))],
    ['ISO', formatMetadataValue(getTag(metadata, ['ISO', 'ISOSetting']))],
    ['Focal length / 焦距', formatFocalLength(getTag(metadata, ['FocalLength']))],
    ['Captured at / 拍摄时间', formatExifDate(getTag(metadata, ['DateTimeOriginal', 'CreateDate']) ?? '--')],
    ['Dimensions / 尺寸', dimensions ? `${dimensions.width} × ${dimensions.height}` : '--']
  ]

  const optional = (label, names, formatter = formatMetadataValue) => {
    const value = getTag(metadata, names)
    if (value !== null && value !== '') items.push([label, formatter(value)])
  }

  optional('Lens specification / 镜头规格', ['LensInfo', 'LensSpecification'], formatLensInfo)
  optional('35mm equivalent / 等效焦距', ['FocalLengthIn35mmFormat', 'FocalLengthIn35mmFilm'], formatFocalLength)
  optional('Exposure compensation / 曝光补偿', ['ExposureCompensation', 'ExposureBiasValue'], formatExposureCompensation)

  const exposureProgram = getTag(metadata, ['ExposureProgram'])
  if (exposureProgram !== null) {
    items.push(['Exposure program / 拍摄模式', formatCode(exposureProgram, EXPOSURE_PROGRAMS)])
  } else {
    optional('Exposure mode / 拍摄模式', ['ExposureMode'], value => formatCode(value, EXPOSURE_MODES))
  }

  optional('Metering mode / 测光模式', ['MeteringMode'], value => formatCode(value, METERING_MODES))
  optional('White balance / 白平衡', ['WhiteBalance'], value => formatCode(value, WHITE_BALANCE_MODES))
  optional('Color space / 色彩空间', ['ColorSpace'], value => formatCode(value, COLOR_SPACES))
  optional('Orientation / 方向', ['Orientation'], value => formatCode(value, ORIENTATIONS))
  optional('Software / 处理软件', ['Software'])

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
  const label = [make, model].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Unknown camera / 未知机身'

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
