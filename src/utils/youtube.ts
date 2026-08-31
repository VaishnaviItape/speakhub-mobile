export const getYouTubeVideoId = (url?: string): string | null => {
  if (!url) return null;
  const clean = url.trim();
  const match = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/);
  if (match && match[1]) return match[1];
  return null;
};

export const getYouTubeThumbnail = (url?: string): string => {
  const id = getYouTubeVideoId(url);
  if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  return '';
};
