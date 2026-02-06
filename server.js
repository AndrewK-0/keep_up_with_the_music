import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import https from 'https';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

// ES modules __dirname alternative
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Spotify credentials from .env
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Cache configuration
const CACHE_DURATION = 720 * 60 * 1000; // 720 minutes in milliseconds
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'artists.json');
const TOKEN_CACHE_FILE = path.join(CACHE_DIR, 'token.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log('Created cache directory:', CACHE_DIR);
}

// Security middleware - Helmet sets various HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
      imgSrc: ["'self'", 'data:', 'https:', 'https://i.scdn.co'], // Allow Spotify images
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Parse JSON bodies with size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// File-based cache helper functions
function readCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      const cache = JSON.parse(data);
      console.log(`Loaded cache from disk: ${cache.artists?.length || 0} artists, age: ${Math.floor((Date.now() - cache.timestamp) / 1000)}s`);
      return cache;
    }
  } catch (error) {
    console.error('Error reading cache from disk:', error.message);
  }
  return { artists: null, timestamp: null };
}

function writeCacheToDisk(artists) {
  try {
    const cache = {
      artists: artists,
      timestamp: Date.now()
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`Wrote ${artists.length} artists to cache file`);
    return true;
  } catch (error) {
    console.error('Error writing cache to disk:', error.message);
    return false;
  }
}

function readTokenFromDisk() {
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      const data = fs.readFileSync(TOKEN_CACHE_FILE, 'utf8');
      const tokenData = JSON.parse(data);
      
      // Check if token is still valid
      if (tokenData.expiry && Date.now() < tokenData.expiry) {
        console.log('Loaded valid access token from disk');
        return tokenData;
      } else {
        console.log('Token on disk has expired');
      }
    }
  } catch (error) {
    console.error('Error reading token from disk:', error.message);
  }
  return { token: null, expiry: null };
}

function writeTokenToDisk(token, expiresIn = 3600) {
  try {
    const tokenData = {
      token: token,
      expiry: Date.now() + (expiresIn * 1000)
    };
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(tokenData, null, 2), 'utf8');
    console.log('Wrote access token to cache file');
    return true;
  } catch (error) {
    console.error('Error writing token to disk:', error.message);
    return false;
  }
}

// Spotify API Functions
function getSpotifyAccessToken() {
  return new Promise((resolve, reject) => {
    // Check if we have a valid cached token on disk
    const cachedToken = readTokenFromDisk();
    if (cachedToken.token && cachedToken.expiry && Date.now() < cachedToken.expiry) {
      return resolve(cachedToken.token);
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return reject(new Error('Spotify credentials not configured. Check your .env file.'));
    }

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const postData = 'grant_type=client_credentials';

    const options = {
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const tokenData = JSON.parse(data);
          // Cache the token to disk (expires in 3600 seconds = 1 hour)
          writeTokenToDisk(tokenData.access_token, tokenData.expires_in);
          console.log('Got new access token from Spotify');
          resolve(tokenData.access_token);
        } else {
          reject(new Error(`Failed to get token: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function fetchSpotifyData(accessToken, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.spotify.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to fetch data: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Batch fetch multiple artists (max 50 at a time per Spotify API docs)
async function getMultipleArtists(accessToken, artistIds) {
  const batches = [];
  
  // Split into batches of 50
  for (let i = 0; i < artistIds.length; i += 50) {
    batches.push(artistIds.slice(i, i + 50));
  }
  
  const allArtists = [];
  
  for (const batch of batches) {
    try {
      const idsParam = batch.join(',');
      const data = await fetchSpotifyData(accessToken, `/v1/artists?ids=${idsParam}`);
      
      if (data.artists) {
        allArtists.push(...data.artists.filter(artist => artist !== null));
      }
      
      // Small delay between batches to avoid rate limiting
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Error fetching batch:`, error.message);
    }
  }
  
  return allArtists;
}

async function getTopArtists(accessToken) {
  console.log('Fetching top artists from Spotify...');
  
  try {
    const artistIds = new Set();
    
    // Search for popular artists across multiple genres
    const genres = ['pop', 'rock', 'hip-hop', 'rap', 'r-n-b', 'electronic', 'indie', 'country'];
    
    console.log('Searching for popular artists across genres...');
    
    for (const genre of genres) {
      try {
        const searchData = await fetchSpotifyData(
          accessToken,
          `/v1/search?q=genre:${encodeURIComponent(genre)}&type=artist&limit=20`
        );
        
        if (searchData.artists && searchData.artists.items) {
          searchData.artists.items.forEach(artist => {
            if (artist.id && artist.popularity > 50) {
              artistIds.add(artist.id);
            }
          });
        }
        
        // Small delay between searches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error searching for ${genre} artists:`, error.message);
      }
    }
    
    console.log(`Found ${artistIds.size} unique artist IDs from search`);
    
    // If we didn't get enough artists, try searching for popular artists directly
    if (artistIds.size < 30) {
      try {
        const popularSearch = await fetchSpotifyData(
          accessToken,
          '/v1/search?q=year:2020-2026&type=artist&limit=50'
        );
        
        if (popularSearch.artists && popularSearch.artists.items) {
          popularSearch.artists.items.forEach(artist => {
            if (artist.id && artist.popularity > 60) {
              artistIds.add(artist.id);
            }
          });
        }
      } catch (error) {
        console.error('Error searching for recent artists:', error.message);
      }
    }
    
    console.log(`Total unique artist IDs: ${artistIds.size}`);
    
    // Convert Set to Array and limit to 50 artists
    const artistIdsArray = Array.from(artistIds).slice(0, 50);
    
    if (artistIdsArray.length === 0) {
      throw new Error('No artists found from search');
    }
    
    // Batch fetch artist details using the proper endpoint
    console.log(`Fetching details for ${artistIdsArray.length} artists...`);
    const detailedArtists = await getMultipleArtists(accessToken, artistIdsArray);
    
    console.log(`Successfully fetched ${detailedArtists.length} artist details`);
    
    // Format and sort by popularity
    const formattedArtists = detailedArtists
      .filter(artist => artist && artist.id) // Filter out any nulls
      .map(artist => ({
        id: artist.id,
        name: artist.name,
        genres: artist.genres || [],
        popularity: artist.popularity || 0,
        followers: artist.followers?.total || 0,
        images: artist.images || [],
        spotify_url: artist.external_urls?.spotify || ''
      }))
      .sort((a, b) => b.popularity - a.popularity);
    
    return formattedArtists;
    
  } catch (error) {
    console.error('Error in getTopArtists:', error);
    throw error;
  }
}

// Check if cache is valid
function isCacheValid() {
  const cache = readCacheFromDisk();
  
  if (!cache.artists || !cache.timestamp) {
    return false;
  }
  
  const now = Date.now();
  const cacheAge = now - cache.timestamp;
  
  return cacheAge < CACHE_DURATION;
}

// Get cache data
function getCachedArtists() {
  const cache = readCacheFromDisk();
  return cache.artists || null;
}

// Refresh cache
async function refreshCache() {
  try {
    console.log('Refreshing artist cache...');
    const accessToken = await getSpotifyAccessToken();
    const artists = await getTopArtists(accessToken);
    
    // Write to disk instead of memory
    writeCacheToDisk(artists);
    
    console.log(`Cache refreshed with ${artists.length} artists at ${new Date().toISOString()}`);
    return artists;
  } catch (error) {
    console.error('Error refreshing cache:', error);
    throw error;
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  const cache = readCacheFromDisk();
  const cacheStatus = isCacheValid() ? 'valid' : 'expired';
  const cacheAge = cache.timestamp 
    ? Math.floor((Date.now() - cache.timestamp) / 1000) 
    : null;
  
  // Get cache file size
  let cacheFileSize = 0;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      cacheFileSize = Math.round(stats.size / 1024); // KB
    }
  } catch (error) {
    // Ignore errors
  }
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cache: {
      status: cacheStatus,
      ageSeconds: cacheAge,
      artistCount: cache.artists ? cache.artists.length : 0,
      fileSizeKB: cacheFileSize,
      storage: 'disk'
    }
  });
});

// Get top artists from Spotify (with caching)
app.get('/api/artists', async (req, res) => {
  try {
    let artists;
    
    if (isCacheValid()) {
      console.log('Serving artists from disk cache');
      artists = getCachedArtists();
    } else {
      console.log('Cache expired or empty, fetching fresh data');
      artists = await refreshCache();
    }
    
    res.json({ 
      success: true,
      artists: artists,
      count: artists.length,
      cached: isCacheValid(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching artists:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch artists from Spotify',
      message: error.message 
    });
  }
});

// Get specific artist details (with caching)
app.get('/api/artists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const accessToken = await getSpotifyAccessToken();
    
    // Check if artist is in cache first
    const cachedArtists = getCachedArtists();
    if (cachedArtists) {
      const cachedArtist = cachedArtists.find(a => a.id === id);
      if (cachedArtist) {
        console.log(`Found artist ${id} in disk cache`);
      }
    }
    
    // Always fetch fresh top tracks (these change frequently)
    const [artist, topTracks] = await Promise.all([
      fetchSpotifyData(accessToken, `/v1/artists/${id}`),
      fetchSpotifyData(accessToken, `/v1/artists/${id}/top-tracks?market=US`)
    ]);
    
    res.json({
      success: true,
      artist: {
        id: artist.id,
        name: artist.name,
        genres: artist.genres,
        popularity: artist.popularity,
        followers: artist.followers.total,
        images: artist.images,
        spotify_url: artist.external_urls.spotify
      },
      topTracks: topTracks.tracks.slice(0, 5).map(track => ({
        id: track.id,
        name: track.name,
        album: track.album.name,
        preview_url: track.preview_url,
        spotify_url: track.external_urls.spotify
      }))
    });
  } catch (error) {
    console.error('Error fetching artist details:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch artist details',
      message: error.message 
    });
  }
});

// Example API endpoint
app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello from the server!' });
});

// Example POST endpoint
app.post('/api/data', (req, res) => {
  const { data } = req.body;
  
  // Validate input
  if (!data || typeof data !== 'string') {
    return res.status(400).json({ error: 'Invalid data provided' });
  }
  
  res.json({ 
    success: true, 
    received: data,
    timestamp: new Date().toISOString()
  });
});

// Handle 404 for API routes
// Serve index.html for all other routes (SPA support)
app.use((req, res) => {
  // Check if it's an API route
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize cache on startup
console.log('Initializing artist cache on startup...');
refreshCache().catch(err => {
  console.error('Failed to initialize cache on startup:', err);
});

// Set up periodic cache refresh (every 15 minutes)
setInterval(() => {
  console.log('Periodic cache refresh triggered');
  refreshCache().catch(err => {
    console.error('Periodic cache refresh failed:', err);
  });
}, CACHE_DURATION);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Cache refresh interval: ${CACHE_DURATION / 1000 / 60} minutes`);
});