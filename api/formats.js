// Vercel serverless function for getting available formats
const { YtDlp } = require('ytdlp-nodejs');

const ytdlp = new YtDlp();

// Helper function to validate YouTube URL
const validateYouTubeURL = (url) => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubeRegex.test(url);
};

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    if (!validateYouTubeURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const info = await ytdlp.getInfoAsync(url);
    const formats = info.formats || [];
    
    const availableFormats = formats.map(format => ({
      format_id: format.format_id,
      ext: format.ext,
      resolution: format.resolution || format.height ? `${format.height}p` : 'unknown',
      filesize: format.filesize,
      vcodec: format.vcodec || 'none',
      acodec: format.acodec || 'none',
      hasVideo: format.vcodec && format.vcodec !== 'none',
      hasAudio: format.acodec && format.acodec !== 'none'
    }));

    res.status(200).json(availableFormats);
  } catch (error) {
    console.error('Error getting formats:', error);
    const errorMessage = error.message || 'Failed to get video formats';
    res.status(500).json({ error: errorMessage });
  }
};

