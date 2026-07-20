// Customer (team captain) photo upload helpers.
//
// Photos live in the public `customer-images` Storage bucket (see
// supabase/migrations/20260720120100_customer_images_bucket.sql) and the
// resulting public URL is stored on customers.avatar_url.
//
// Everything here is plain browser code — no React — so the Customers page can
// call it from its save handler.

import { supabase } from '@/supabase.js'

export const BUCKET = 'customer-images'

// Backstop matching the bucket's server-side file_size_limit. Supabase's own
// platform ceiling is 50MB, but a captain photo has no business being anywhere
// near that, and the Customers table renders a page of these at once.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// Longest edge of the stored image. Rendered at ~32px in the table and ~80px in
// the dialog, so 512 leaves plenty of room for high-DPI screens.
export const AVATAR_MAX_PX = 512

export function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`
  return `${Math.round(n / 1024)}KB`
}

// Throws a user-facing Error if the picked file isn't something we'll accept.
// Called on pick (so the operator finds out immediately) and again before
// upload.
export function validateImageFile(file) {
  if (!file) throw new Error('No file selected.')
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image. Pick a JPG, PNG, or WebP.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That image is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`)
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read. Try a different file.')) }
    img.src = url
  })
}

// Shrink to AVATAR_MAX_PX on the long edge and re-encode. A phone photo goes
// from several MB to roughly 30-100KB, which is what keeps the customers table
// fast when every row has a picture. Prefers WebP, falls back to JPEG on
// browsers whose toBlob doesn't support it.
export async function downscaleImage(file) {
  const img = await loadImage(file)
  const scale = Math.min(1, AVATAR_MAX_PX / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)

  const encode = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.85))
  const webp = await encode('image/webp')
  if (webp) return { blob: webp, ext: 'webp', contentType: 'image/webp' }
  const jpeg = await encode('image/jpeg')
  if (jpeg) return { blob: jpeg, ext: 'jpg', contentType: 'image/jpeg' }
  throw new Error('This browser could not process that image.')
}

// Uploads a downscaled copy and returns its public URL. The filename carries a
// timestamp so replacing a photo produces a NEW URL — otherwise the CDN would
// keep serving the old image from cache.
export async function uploadCustomerImage(customerId, file) {
  validateImageFile(file)
  const { blob, ext, contentType } = await downscaleImage(file)
  const path = `${customerId}-${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`Photo upload failed: ${error.message}`)

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// Recover the object path from a public URL, which looks like
// .../storage/v1/object/public/customer-images/<path>. Returns null for
// anything that isn't a URL into our bucket.
function pathFromPublicUrl(url) {
  if (!url) return null
  const marker = `/object/public/${BUCKET}/`
  const at = url.indexOf(marker)
  if (at === -1) return null
  const path = url.slice(at + marker.length).split('?')[0]
  return path ? decodeURIComponent(path) : null
}

// Best-effort cleanup of a replaced/removed photo. Deliberately never throws: an
// orphaned object in the bucket is harmless, and must not stop the customer
// record itself from saving.
export async function deleteCustomerImage(url) {
  const path = pathFromPublicUrl(url)
  if (!path) return
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) console.warn('Could not delete old customer image:', error.message)
}
