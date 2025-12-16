// Vercel serverless function for getting video info
let YtDlp;
let ytdlp = null;

// Lazy load yt-dlp to handle module loading errors
const getYtDlp = async () => {
  if (!YtDlp) {
    try {
      YtDlp = require('ytdlp-nodejs').YtDlp;
    } catch (error) {
      console.error('Failed to load ytdlp-nodejs:', error);
      throw new Error('YouTube downloader library is not available');
    }
  }
  
  if (!ytdlp) {
    try {
      ytdlp = new YtDlp();
      // Try to check installation and download binary if needed
      try {
        await ytdlp.checkInstallationAsync();
        console.log('yt-dlp binary is available');
      } catch (installError) {
        console.log('yt-dlp binary not found, attempting to download...');
        // The library should auto-download, but we can try to trigger it
        // by calling a method that requires the binary
        try {
          // This will trigger binary download if needed
          await ytdlp.getInfoAsync('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
          console.log('yt-dlp binary downloaded successfully');
        } catch (downloadError) {
          console.error('Failed to download yt-dlp binary:', downloadError);
          throw new Error('yt-dlp binary is not available and could not be downloaded. Please ensure the binary is installed during build.');
        }
      }
    } catch (error) {
      console.error('Failed to initialize yt-dlp:', error);
      throw error;
    }
  }
  return ytdlp;
};

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

    // Initialize yt-dlp
    const ytdlpInstance = await getYtDlp();

    // Get video info using yt-dlp (with timeout)
    const infoPromise = ytdlpInstance.getInfoAsync(url);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout - YouTube may be slow or unavailable')), 30000)
    );
    
    const info = await Promise.race([infoPromise, timeoutPromise]);
    
    const videoDetails = {
      title: info.title || info.fulltitle || 'Unknown Title',
      thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails[0]?.url) || null,
      duration: info.duration || 0,
      author: info.uploader || info.channel || 'Unknown Author',
      formats: info.formats || []
    };

    res.status(200).json(videoDetails);
  } catch (error) {
    console.error('Error getting video info:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    
    // Return error in a format the client can handle
    const errorMessage = error.message || 'Failed to get video information';
    
    // Check if it's a yt-dlp initialization error
    if (error.message && error.message.includes('yt-dlp')) {
      return res.status(503).json({ 
        error: 'YouTube downloader service is temporarily unavailable. Please try again later or use a different hosting platform.',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
    // Return simple error message for client
    res.status(500).json({ 
      error: errorMessage,
      code: error.code || 'UNKNOWN'
    });
  }
};

