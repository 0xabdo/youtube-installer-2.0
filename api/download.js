// Vercel serverless function for downloading videos
// Note: This may have limitations on Vercel due to execution time and file system restrictions
const { YtDlp } = require('ytdlp-nodejs');
const fs = require('fs-extra');
const path = require('path');

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
    const { url, format = 'mp4' } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    if (!validateYouTubeURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Get video info first to get the title
    const info = await ytdlp.getInfoAsync(url);
    const videoTitle = (info.title || info.fulltitle || 'video').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    let fileName = `${videoTitle}.${format}`;

    // Use /tmp directory for Vercel (only writable location)
    const downloadsDir = '/tmp';
    fs.ensureDirSync(downloadsDir);

    // Generate unique filename to avoid conflicts
    const tempFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${format === 'mp3' ? 'm4a' : 'mp4'}`;
    const tempFilePath = path.join(downloadsDir, tempFileName);

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Set appropriate content type based on format
    if (format === 'mp3') {
      res.setHeader('Content-Type', 'audio/mpeg');
    } else {
      res.setHeader('Content-Type', 'video/mp4');
    }

    // Configure download options
    const downloadOptions = {
      output: tempFilePath,
      format: format === 'mp3' 
        ? 'bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio[ext=webm]/bestaudio'
        : 'best[ext=mp4]/best',
      onProgress: (progress) => {
        if (progress && progress.percent) {
          console.log(`Download progress: ${progress.percent}%`);
        }
      }
    };

    // Download to temporary file
    await ytdlp.downloadAsync(url, downloadOptions);

    // Find the actual downloaded file (extension might vary for audio)
    let actualFilePath = tempFilePath;
    if (format === 'mp3') {
      const files = fs.readdirSync(downloadsDir);
      const downloadedFile = files.find(f => 
        f.startsWith(tempFileName.split('.')[0]) && 
        (f.endsWith('.m4a') || f.endsWith('.opus') || f.endsWith('.webm'))
      );
      if (downloadedFile) {
        actualFilePath = path.join(downloadsDir, downloadedFile);
        fileName = downloadedFile.replace(/\.(m4a|opus|webm)$/, '.mp3');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      }
    }

    // Stream the file to response
    const fileStream = fs.createReadStream(actualFilePath);
    fileStream.pipe(res);

    // Delete file immediately after streaming completes
    fileStream.on('end', () => {
      fs.remove(actualFilePath).catch(() => {});
      // Clean up any fragment files
      try {
        const files = fs.readdirSync(downloadsDir);
        files.forEach(file => {
          if (file.startsWith('--') || file.startsWith(tempFileName.split('.')[0])) {
            fs.remove(path.join(downloadsDir, file)).catch(() => {});
          }
        });
      } catch (err) {
        // Ignore cleanup errors
      }
    });

    fileStream.on('error', (error) => {
      console.error('Stream error:', error);
      fs.remove(actualFilePath).catch(() => {});
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream video' });
      }
    });

  } catch (error) {
    console.error('Error downloading video:', error);
    if (!res.headersSent) {
      const errorMessage = error.message || 'Failed to download video';
      res.status(500).json({ error: errorMessage });
    }
  }
};

