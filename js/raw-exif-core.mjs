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
