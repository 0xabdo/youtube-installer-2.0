import React, { useState } from 'react';
import axios from 'axios';
import { Download, Play, Music, AlertCircle, CheckCircle, Loader, Info } from 'lucide-react';

function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp4');
  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const getVideoInfo = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setVideoInfo(null);

    try {
      const response = await axios.get(`/api/video-info?url=${encodeURIComponent(url)}`);
      setVideoInfo(response.data);
      setSuccess('Video information retrieved successfully!');
    } catch (error) {
      // Handle error response properly
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          error.message || 
                          'Failed to get video information';
      setError(typeof errorMessage === 'string' ? errorMessage : 'Failed to get video information');
      console.error('Error getting video info:', error.response?.data || error);
    } finally {
      setLoading(false);
    }
  };

  const downloadVideo = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setDownloading(true);
    setError('');

    try {
      const response = await axios.get(`/api/download?url=${encodeURIComponent(url)}&format=${format}`, {
        responseType: 'blob'
      });

      // Create download link
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Get filename from response headers or create one
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'youtube_video';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Download completed successfully!');
    } catch (error) {
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          error.message || 
                          'Failed to download video. Please try again.';
      setError(typeof errorMessage === 'string' ? errorMessage : 'Failed to download video. Please try again.');
      console.error('Error downloading video:', error.response?.data || error);
    } finally {
      setDownloading(false);
    }
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleUrlChange = (e) => {
    setUrl(e.target.value);
    setError('');
    setSuccess('');
    setVideoInfo(null);
  };

  return (
    <div className="app">
      {/* Header Section */}
      <header className="header">
        <div className="header-content">
          <div className="header-text">
            <h1>Professional YouTube Downloader</h1>
            <p>Enterprise-grade tool for downloading YouTube videos in high quality. Fast, secure, and reliable downloads for content creators and educators.</p>
          </div>
          <div className="header-stats">
            <div className="stat-item">
              <div className="stat-number">10M+</div>
              <div className="stat-label">Downloads</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">99.9%</div>
              <div className="stat-label">Success Rate</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">24/7</div>
              <div className="stat-label">Availability</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="content-wrapper">
          {/* Left Panel - Download Form */}
          <div className="download-panel">
            <div className="panel-header">
              <h2>Download Video</h2>
              <p>Enter a YouTube URL to get started</p>
            </div>

            <div className="form-section">
              <div className="input-group">
                <label htmlFor="youtube-url">YouTube Video URL</label>
                <input
                  type="text"
                  id="youtube-url"
                  className="url-input"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={handleUrlChange}
                  onKeyPress={(e) => e.key === 'Enter' && getVideoInfo()}
                />
              </div>

              <div className="format-selector">
                <div className="format-option">
                  <input
                    type="radio"
                    id="mp4"
                    name="format"
                    value="mp4"
                    checked={format === 'mp4'}
                    onChange={(e) => setFormat(e.target.value)}
                  />
                  <label htmlFor="mp4">
                    <Play size={16} />
                    MP4 Video
                  </label>
                </div>
                <div className="format-option">
                  <input
                    type="radio"
                    id="mp3"
                    name="format"
                    value="mp3"
                    checked={format === 'mp3'}
                    onChange={(e) => setFormat(e.target.value)}
                  />
                  <label htmlFor="mp3">
                    <Music size={16} />
                    MP3 Audio
                  </label>
                </div>
              </div>

              <button
                className="primary-btn"
                onClick={getVideoInfo}
                disabled={loading || downloading}
              >
                {loading ? (
                  <>
                    <Loader className="spinner" size={20} />
                    Analyzing Video...
                  </>
                ) : (
                  <>
                    <Info size={20} />
                    Get Video Information
                  </>
                )}
              </button>

              {error && (
                <div className="error-message">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {success && (
                <div className="success-message">
                  <CheckCircle size={16} />
                  {success}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Video Info */}
          <div className="info-panel">
            {videoInfo ? (
              <div className="video-info-card">
                <div className="video-header">
                  <h3>Video Information</h3>
                  <div className="video-thumbnail">
                    {videoInfo.thumbnail && (
                      <img
                        src={videoInfo.thumbnail}
                        alt="Video thumbnail"
                        className="thumbnail"
                      />
                    )}
                  </div>
                </div>
                
                <div className="video-details">
                  <div className="detail-item">
                    <span className="detail-label">Title:</span>
                    <span className="detail-value">{videoInfo.title}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Author:</span>
                    <span className="detail-value">{videoInfo.author}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">{formatDuration(videoInfo.duration)}</span>
                  </div>
                </div>

                <button
                  className="download-btn"
                  onClick={downloadVideo}
                  disabled={downloading}
                >
                  {downloading ? (
                    <>
                      <Loader className="spinner" size={20} />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download size={20} />
                      Download {format.toUpperCase()}
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <Play size={48} />
                </div>
                <h3>Ready to Download</h3>
                <p>Enter a YouTube URL and click "Get Video Information" to start</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Professional YouTube Downloader</h4>
            <p>Enterprise-grade tool for content creators and educators</p>
          </div>
          <div className="footer-section">
            <h4>Legal</h4>
            <p>Please respect YouTube's Terms of Service and copyright laws</p>
          </div>
          <div className="footer-section">
            <h4>Support</h4>
            <p>24/7 technical support available</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2024 Professional YouTube Downloader. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
