const express = require('express');
const cors = require('cors');
const { YtDlp } = require('ytdlp-nodejs');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize yt-dlp
const ytdlp = new YtDlp();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create temporary downloads directory for streaming (files are deleted immediately after)
const downloadsDir = path.join(__dirname, 'downloads');
fs.ensureDirSync(downloadsDir);

// Periodic cleanup of any leftover temp files (runs every 5 minutes)
setInterval(() => {
  try {
    const files = fs.readdirSync(downloadsDir);
    files.forEach(file => {
      // Remove fragment files and any files older than 1 hour
      const filePath = path.join(downloadsDir, file);
      if (file.startsWith('--')) {
        fs.remove(filePath).catch(() => {});
      } else {
        const stats = fs.statSync(filePath);
        const age = Date.now() - stats.mtimeMs;
        // Remove files older than 1 hour (3600000 ms)
        if (age > 3600000) {
          fs.remove(filePath).catch(() => {});
        }
      }
    });
  } catch (err) {
    // Ignore cleanup errors
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Helper function to validate YouTube URL
const validateYouTubeURL = (url) => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubeRegex.test(url);
};

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'YouTube Downloader API is running' });
});

// Get video info
app.get('/api/video-info', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    if (!validateYouTubeURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Get video info using yt-dlp
    const info = await ytdlp.getInfoAsync(url);
    
    const videoDetails = {
      title: info.title || info.fulltitle || 'Unknown Title',
      thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails[0]?.url) || null,
      duration: info.duration || 0,
      author: info.uploader || info.channel || 'Unknown Author',
      formats: info.formats || []
    };

    res.json(videoDetails);
  } catch (error) {
    console.error('Error getting video info:', error);
    const errorMessage = error.message || 'Failed to get video information';
    res.status(500).json({ error: errorMessage });
  }
});

// Download video - streams directly to user without saving to server
app.get('/api/download', async (req, res) => {
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

    // Set headers for file download
    res.header('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Set appropriate content type based on format
    if (format === 'mp3') {
      res.header('Content-Type', 'audio/mpeg');
    } else {
      res.header('Content-Type', 'video/mp4');
    }

    // Use temporary file for streaming, then delete immediately
    // Generate unique filename to avoid conflicts
    const tempFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${format === 'mp3' ? 'm4a' : 'mp4'}`;
    const tempFilePath = path.join(downloadsDir, tempFileName);

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
        res.header('Content-Disposition', `attachment; filename="${fileName}"`);
      }
    }

    // Stream the file to response
    const fileStream = fs.createReadStream(actualFilePath);
    fileStream.pipe(res);

    // Delete file immediately after streaming completes
    fileStream.on('end', () => {
      // Clean up the main file
      fs.remove(actualFilePath).catch(() => {});
      
      // Clean up any fragment files or temp files created by yt-dlp
      try {
        const files = fs.readdirSync(downloadsDir);
        files.forEach(file => {
          const filePath = path.join(downloadsDir, file);
          // Remove fragment files (--Frag*, --Part*, etc.) and temp files
          if (file.startsWith('--') || file.startsWith(tempFileName.split('.')[0])) {
            fs.remove(filePath).catch(() => {});
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

    // Handle client disconnect - clean up file
    req.on('close', () => {
      if (!fileStream.destroyed) {
        fileStream.destroy();
      }
      // Clean up main file and any fragments
      fs.remove(actualFilePath).catch(() => {});
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

  } catch (error) {
    console.error('Error downloading video:', error);
    if (!res.headersSent) {
      const errorMessage = error.message || 'Failed to download video';
      res.status(500).json({ error: errorMessage });
    }
  }
});

// Get available formats
app.get('/api/formats', async (req, res) => {
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

    res.json(availableFormats);
  } catch (error) {
    console.error('Error getting formats:', error);
    const errorMessage = error.message || 'Failed to get video formats';
    res.status(500).json({ error: errorMessage });
  }
});

// Serve React app (only in production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
  });
}

// Export the app for Vercel serverless functions
module.exports = app;

// Only start the server if not in Vercel environment
if (process.env.VERCEL !== '1' && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
  });
}
