const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const RAW_EXTENSIONS = new Set([
  '3fr', 'ari', 'arq', 'arw', 'bay', 'cap', 'cr2', 'cr3', 'crw', 'dcr',
  'dcs', 'dng', 'drf', 'eip', 'erf', 'fff', 'gpr', 'iiq', 'k25', 'kdc',
  'mdc', 'mef', 'mos', 'mrw', 'nef', 'nrw', 'obm', 'orf', 'pef', 'ptx',
  'pxn', 'r3d', 'raf', 'raw', 'rw2', 'rwl', 'rwz', 'sr2', 'srf', 'srw', 'x3f'
])

const first = value => Array.isArray(value) ? value[0] : value

export const tagValue = tag => {
  if (tag === null || tag === undefined) return ''
  if (typeof tag !== 'object') return tag
  if (tag.value !== undefined) return first(tag.value)
  return tag.description ?? ''
}

const tagDescription = tag => {
  if (tag === null || tag === undefined) return ''
  if (typeof tag !== 'object') return String(tag)
  return String(tag.description ?? tagValue(tag) ?? '')
}

const numberFromTag = tag => {
  const raw = tagValue(tag)
  if (Array.isArray(raw) && raw.length >= 2 && Number(raw[1])) return Number(raw[0]) / Number(raw[1])
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) return numeric
  const match = tagDescription(tag).match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

export const inferBrand = make => {
  const normalized = String(make || '').toLowerCase()
  const brands = [
    ['nikon', 'nikon'], ['sony', 'sony'], ['canon', 'canon'], ['fujifilm', 'fujifilm'],
    ['fuji', 'fujifilm'], ['leica', 'leica'], ['hasselblad', 'hasselblad'],
    ['apple', 'apple'], ['xiaomi', 'xiaomi']
  ]
  return brands.find(([needle]) => normalized.includes(needle))?.[1] || 'text'
}

export const formatFocalLength = tag => {
  const numeric = numberFromTag(tag)
  return numeric && numeric > 0 ? `${Number(numeric.toFixed(1))}mm` : ''
}

export const formatAperture = tag => {
  const numeric = numberFromTag(tag)
  return numeric && numeric > 0 ? `F/${Number(numeric.toFixed(1))}` : ''
}

export const formatExposureTime = tag => {
  const description = tagDescription(tag).trim()
  const fraction = description.match(/(\d+)\s*\/\s*(\d+)/)
  if (fraction) return `${fraction[1]}/${fraction[2]}`

  const numeric = numberFromTag(tag)
  if (!numeric || numeric <= 0) return ''
  if (numeric < 1) return `1/${Math.round(1 / numeric)}`
  return `${Number(numeric.toFixed(2))}s`
}

export const formatIso = tag => {
  const numeric = numberFromTag(tag)
  return numeric && numeric > 0 ? `ISO${Math.round(numeric)}` : ''
}

export const exposureBiasValue = tag => {
  if (tag === null || tag === undefined || tag === '') return null
  const descriptionMatch = tagDescription(tag).match(/[+-]?\d+(?:\.\d+)?/)
  const numeric = descriptionMatch ? Number(descriptionMatch[0]) : numberFromTag(tag)
  return Number.isFinite(numeric) ? Math.min(5, Math.max(-5, Number(numeric.toFixed(1)))) : null
}

export const formatExposureBias = value => {
  if (value === null || value === undefined || value === '') return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  if (Math.abs(numeric) < 0.05) return '0 EV'
  const rounded = Number(numeric.toFixed(1))
  return `${rounded > 0 ? '+' : ''}${rounded} EV`
}

export const formatDate = tag => {
  const value = tagDescription(tag).trim()
  const match = value.match(/(\d{4})[:/-](\d{2})[:/-](\d{2})/)
  if (!match) return ''
  return `${match[1]} ${MONTHS[Number(match[2]) - 1]} ${match[3]}`
}

export const mapExifToFields = tags => {
  const make = tagDescription(tags.Make).trim()
  const model = tagDescription(tags.Model).trim()
  const makeKey = make.split(/\s+/)[0]?.toLowerCase() || ''
  const camera = (makeKey && model.toLowerCase().includes(makeKey) ? model : [make, model].filter(Boolean).join(' ')).toUpperCase()
  return {
    brand: make ? inferBrand(make) : 'none',
    camera,
    lens: tagDescription(tags.LensModel || tags.LensInfo).trim(),
    focalLength: formatFocalLength(tags.FocalLength),
    aperture: formatAperture(tags.FNumber || tags.ApertureValue),
    shutter: formatExposureTime(tags.ExposureTime),
    iso: formatIso(tags.ISOSpeedRatings || tags.PhotographicSensitivity || tags.ISO),
    bias: exposureBiasValue(tags.ExposureBiasValue || tags.ExposureCompensation),
    date: formatDate(tags.DateTimeOriginal || tags.DateTimeDigitized || tags.DateTime)
  }
}

export const fitText = (context, text, maxWidth, startSize, minSize = 10) => {
  let size = startSize
  while (size > minSize) {
    context.font = context.font.replace(/\d+(?:\.\d+)?px/, `${size}px`)
    if (context.measureText(text).width <= maxWidth) break
    size -= 1
  }
  return size
}

export const outputDimensions = (width, height, mode, barRatio, frameRatio) => {
  const safeBar = Math.min(0.2, Math.max(0.06, Number(barRatio) || 0.1))
  const safeFrame = Math.min(0.12, Math.max(0, Number(frameRatio) || 0))
  if (mode === 'overlay') return { width, height, frame: 0, bar: 0 }

  const frame = mode === 'card' ? Math.round(width * safeFrame) : 0
  const bar = Math.round(width * safeBar)
  return { width: width + frame * 2, height: height + frame * 2 + bar, frame, bar }
}

export const wheelZoomFactor = (deltaY, deltaMode = 0, pageHeight = 800, pinchGesture = false) => {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, pageHeight) : 1
  const pixels = Math.min(120, Math.max(-120, Number(deltaY) * unit || 0))
  const sensitivity = pinchGesture ? 0.002 : 0.0015
  return Math.exp(-pixels * sensitivity)
}

export const normalizeOrientation = tag => {
  const numeric = Number(tagValue(tag))
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 8) return numeric
  const description = tagDescription(tag).toLowerCase()
  if (/270(?:°| degrees?)? cw|90(?:°| degrees?)? ccw/.test(description)) return 8
  if (/90(?:°| degrees?)? cw/.test(description)) return 6
  if (/180(?:°| degrees?)/.test(description)) return 3
  return 1
}

export const orientedImageDimensions = (width, height, orientation) => (
  orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height }
)

export const createJpegRangeScanner = () => {
  const ranges = []
  let offset = 0
  let previousTwo = -1
  let previous = -1
  let start = null

  const push = bytes => {
    for (const byte of bytes) {
      if (start === null && previousTwo === 0xff && previous === 0xd8 && byte === 0xff) {
        start = offset - 2
      }
      if (start !== null && previous === 0xff && byte === 0xd9) {
        ranges.push({ start, end: offset + 1, size: offset + 1 - start })
        start = null
      }
      previousTwo = previous
      previous = byte
      offset += 1
    }
  }

  return { push, ranges }
}
