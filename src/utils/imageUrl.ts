/**
 * Extracts Google Drive File ID from any share / view / export link
 */
export const extractGoogleDriveFileId = (url?: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Pattern: /file/d/{id}
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // Pattern: id={id} (e.g., ?id=... or &id=...)
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (idMatch && idMatch[1] && (trimmed.includes('google.com') || trimmed.includes('googleusercontent.com'))) {
    return idMatch[1];
  }

  // Pattern: /d/{id}
  const dMatch = trimmed.match(/\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
  if (dMatch && dMatch[1]) return dMatch[1];

  return null;
};

/**
 * Formats any Google Drive sharing link, Google Image search link, Dropbox link, or web URL
 * into a direct displayable image stream URL for React Native <Image>.
 */
export const formatGoogleDriveImageUrl = (url?: string): string => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Google Image Search URL pattern (e.g. google.com/imgres?imgurl=...)
  const imgUrlMatch = trimmed.match(/[?&]imgurl=([^&]+)/i);
  if (imgUrlMatch && imgUrlMatch[1]) {
    try {
      return decodeURIComponent(imgUrlMatch[1]);
    } catch {
      return imgUrlMatch[1];
    }
  }

  // Google URL Redirect pattern (e.g. google.com/url?q=...)
  const qMatch = trimmed.match(/[?&]q=([^&]+)/i);
  if (qMatch && qMatch[1] && (trimmed.includes('google.com/url') || trimmed.includes('google.co.in/url'))) {
    try {
      return decodeURIComponent(qMatch[1]);
    } catch {
      return qMatch[1];
    }
  }

  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    // Google Drive direct image thumbnail endpoint (high-res sz=w1000)
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;
  }

  // Dropbox share links (dl=0 -> raw=1)
  if (trimmed.includes('dropbox.com')) {
    return trimmed.replace(/[?&]dl=0/g, '?raw=1');
  }

  return trimmed;
};
