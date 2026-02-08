import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import http from 'http';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import argon2 from "argon2";
import sanitizeHtml from "sanitize-html";
import cors from "cors"

// Load environment variables
dotenv.config();

// ES modules __dirname alternative
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for secure cookies
app.set('trust proxy', ['127.0.0.1', '::1']);

app.use(cors({
  origin: isDev ? "https://localhost:3000" : "https://yourdomain.com",
  credentials: true
}));

// Middleware
app.use(cookieParser());

if (!process.env.SESSION_SECRET && !isDev) {
  throw new Error("SESSION_SECRET must be set in production");
}

// Session configuration
app.use(
  session({
    name: 'spotify.sid',
        genid: () => crypto.randomUUID(),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: !isDev,
        sameSite: "strict",
        maxAge: 1000 * 60 * 2 // 2 minutes
  }
}));
 

app.use((req, res, next) => {
  // Only check if a session exists
  if (req.session && req.session.ua) {
    const currentUA = hashUA(req);

    if (req.session.ua !== currentUA) {
      console.warn("⚠️ Session UA mismatch — destroying session");
     return req.session.destroy(() => {
        res.clearCookie('spotify.sid');
        return res.status(401).json({
            error: "SESSION_INVALID",
            message: "Session expired or invalidated"
  });
});

    }
  }
  next();
});

// Redirect to HTTPS in development
if (isDev) {
  app.use((req, res, next) => {
    if (!req.secure) {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Spotify credentials
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://localhost:${PORT}/auth/spotify/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('⚠️  Missing Spotify credentials in .env file');
}

// Cache configuration
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours (more reasonable than 720 minutes)
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'artists.json');
const TOKEN_CACHE_FILE = path.join(CACHE_DIR, 'token.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log('✓ Created cache directory:', CACHE_DIR);
}

// Security middleware - Helmet
// Different CSP for development and production
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:', 'https:', 'https://i.scdn.co'],
  connectSrc: ["'self'"],
  fontSrc: ["'self'"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  frameSrc: ["'none'"],
};

// In production with nginx proxy manager, allow Cloudflare scripts
// Force HTTPS in production (behind proxy)
if (!isDev) {
  app.use((req, res, next) => {
    if (!req.secure) {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}


// Security middleware - Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: cspDirectives,
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(helmet.hsts({
  maxAge: 63072000,
  includeSubDomains: true,
  preload: true
}));

function hashUA(req) {
  return crypto
    .createHash("sha256")
    .update(req.headers["user-agent"] || "")
    .digest("hex");
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Auth 
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "SESSION_EXPIRED",
      message: "Your session has expired. Please sign in again."
    });
  }
  next();
}


// ============================================================================
// CACHE HELPER FUNCTIONS
// ============================================================================

function readCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      const cache = JSON.parse(data);
      const ageSeconds = Math.floor((Date.now() - cache.timestamp) / 1000);
      console.log(`✓ Loaded cache from disk: ${cache.artists?.length || 0} artists, age: ${ageSeconds}s`);
      return cache;
    }
  } catch (error) {
    console.error('✗ Error reading cache from disk:', error.message);
  }
  return { artists: null, timestamp: null };
}

function writeCacheToDisk(artists) {
  try {
    const cache = {
      artists: artists,
      timestamp: Date.now(),
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`✓ Wrote ${artists.length} artists to cache file`);
    return true;
  } catch (error) {
    console.error('✗ Error writing cache to disk:', error.message);
    return false;
  }
}

function isCacheValid() {
  const cache = readCacheFromDisk();
  if (!cache.artists || !cache.timestamp) {
    return false;
  }
  const cacheAge = Date.now() - cache.timestamp;
  return cacheAge < CACHE_DURATION;
}

function getCachedArtists() {
  const cache = readCacheFromDisk();
  return cache.artists || null;
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

function readTokenFromDisk() {
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      const data = fs.readFileSync(TOKEN_CACHE_FILE, 'utf8');
      const tokenData = JSON.parse(data);

      if (tokenData.expiry && Date.now() < tokenData.expiry) {
        console.log('✓ Loaded valid access token from disk');
        return tokenData;
      } else {
        console.log('⚠️  Token on disk has expired');
      }
    }
  } catch (error) {
    console.error('✗ Error reading token from disk:', error.message);
  }
  return { token: null, expiry: null };
}

function writeTokenToDisk(token, expiresIn = 3600) {
  try {
    const tokenData = {
      token: token,
      expiry: Date.now() + expiresIn * 1000,
    };
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(tokenData, null, 2), 'utf8');
    console.log('✓ Wrote access token to cache file');
    return true;
  } catch (error) {
    console.error('✗ Error writing token to disk:', error.message);
    return false;
  }
}

// ============================================================================
// SPOTIFY API FUNCTIONS
// ============================================================================

async function getSpotifyAccessToken() {
  // Check cached token first
  const cachedToken = readTokenFromDisk();
  if (cachedToken.token && cachedToken.expiry && Date.now() < cachedToken.expiry) {
    return cachedToken.token;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Spotify credentials not configured. Check your .env file.');
  }

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const postData = 'grant_type=client_credentials';

  const options = {
    hostname: 'accounts.spotify.com',
    path: '/api/token',
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const tokenData = JSON.parse(data);
          writeTokenToDisk(tokenData.access_token, tokenData.expires_in);
          console.log('✓ Got new access token from Spotify');
          resolve(tokenData.access_token);
        } else {
          reject(new Error(`Failed to get token: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function fetchSpotifyData(accessToken, path) {
  const options = {
    hostname: 'api.spotify.com',
    path: path,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  return new Promise((resolve, reject) => {
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

    req.on('error', reject);
    req.end();
  });
}

// Batch fetch multiple artists (max 50 at a time per Spotify API)
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
        allArtists.push(...data.artists.filter((artist) => artist !== null));
      }

      // Small delay between batches to avoid rate limiting
      if (batches.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Error fetching artist batch:', error.message);
    }
  }

  return allArtists;
}

// Get top 50 global artists (from Spotify's top 50 global playlist)
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

// Get user's top artists (requires user authentication)
async function getUserTopArtists(userAccessToken, limit = 50, timeRange = 'medium_term') {
  try {
    const data = await fetchSpotifyData(
      userAccessToken,
      `/v1/me/top/artists?limit=${limit}&time_range=${timeRange}`
    );
    return data.items || [];
  } catch (error) {
    console.error('Error fetching user top artists:', error);
    throw error;
  }
}

// Refresh cache
async function refreshCache() {
  try {
    console.log('🔄 Refreshing artist cache...');
    const accessToken = await getSpotifyAccessToken();
    const artists = await getTopArtists(accessToken);

    if (!artists.length) {
      throw new Error("No artists returned from Spotify");
    }

    writeCacheToDisk(artists);
    console.log(`✓ Cache refreshed with ${artists.length} artists`);
    return artists;
  } catch (error) {
    console.error('✗ Error refreshing cache:', error.message);
    return getCachedArtists() || [];
  }
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
  const cache = readCacheFromDisk();
  const cacheStatus = isCacheValid() ? 'valid' : 'expired';
  const cacheAge = cache.timestamp ? Math.floor((Date.now() - cache.timestamp) / 1000) : null;

  let cacheFileSize = 0;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      cacheFileSize = Math.round(stats.size / 1024);
    }
  } catch (error) {
    // Ignore
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    authenticated: !!req.session.spotifyToken,
    cache: {
      status: cacheStatus,
      ageSeconds: cacheAge,
      artistCount: cache.artists ? cache.artists.length : 0,
      fileSizeKB: cacheFileSize,
    },
  });
});

// Get top artists (global chart if not logged in, user's top if logged in)
app.get('/api/artists', async (req, res) => {
  try {
    let artists;
    let source = 'global';

    // Check if user is authenticated
    if (req.session.spotifyToken) {
      try {
        // Get user's personal top artists
        artists = await getUserTopArtists(req.session.spotifyToken);
        source = 'personal';
        console.log(`✓ Serving personal top artists for authenticated user`);
      } catch (error) {
        console.error('Error fetching user artists, falling back to global:', error.message);
        // Token might be expired, clear it
        delete req.session.spotifyToken;
        // Fall through to global chart
      }
    }

    // If not authenticated or user fetch failed, use global chart
    if (!artists) {
      if (isCacheValid()) {
        console.log('✓ Serving global artists from cache');
        artists = getCachedArtists();
      } else {
        console.log('⚠️  Cache expired, fetching fresh data');
        artists = await refreshCache();
      }
    }

    res.json({
      success: true,
      artists: artists,
      count: artists.length,
      source: source,
      cached: source === 'global' && isCacheValid(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('✗ Error fetching artists:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch artists from Spotify',
      message: error.message,
    });
  }
});

// Get specific artist details
app.get('/api/artists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Use user token if available, otherwise use client credentials
    const accessToken = req.session.spotifyToken || (await getSpotifyAccessToken());

    // Fetch artist and top tracks
    const [artist, topTracks] = await Promise.all([
      fetchSpotifyData(accessToken, `/v1/artists/${id}`),
      fetchSpotifyData(accessToken, `/v1/artists/${id}/top-tracks?market=US`),
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
        spotify_url: artist.external_urls.spotify,
      },
      topTracks: topTracks.tracks.slice(0, 5).map((track) => ({
        id: track.id,
        name: track.name,
        album: track.album.name,
        preview_url: track.preview_url,
        spotify_url: track.external_urls.spotify,
      })),
    });
  } catch (error) {
    console.error('✗ Error fetching artist details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch artist details',
      message: error.message,
    });
  }
});

// Comments page without .html
app.get("/comments", (req, res) => {
  res.sendFile(path.join(__dirname, "public/comments.html"));
});

// Home page without .html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Spotify auth status
app.get("/api/auth/spotify/status", (req, res) => {
  res.json({
    authenticated: !!req.session.spotifyToken
  });
});


// Check authentication status app account
// Check authentication status for the app account (comments)
app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: !!req.session.user,
    user: req.session.user || null,
    expiresAt: req.session.cookie ? req.session.cookie.expires : null,
  });
});



// ============================================================================
// SPOTIFY OAUTH
// ============================================================================

app.get('/auth/spotify', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state; // Store state for validation

  const scope = [
    'user-read-email',
    'user-read-private',
    'user-top-read', // Required for personal top artists
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state: state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get('/auth/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.redirect('/?error=spotify_auth_failed');
  }

  // Validate state to prevent CSRF attacks
  if (state !== req.session.oauthState) {
    console.error('State mismatch - possible CSRF attack');
    return res.redirect('/?error=invalid_state');
  }

  delete req.session.oauthState; // Clear state after validation

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();

    // Store token in session (expires in 1 hour by session config)
    req.session.spotifyToken = tokenData.access_token;
    req.session.refreshToken = tokenData.refresh_token; // Store for future use
    req.session.tokenExpiry = Date.now() + tokenData.expires_in * 1000;
    req.session.ua = hashUA(req);
    console.log('✓ User authenticated successfully');
    res.redirect('/?auth=success');
  } catch (err) {
    console.error('✗ OAuth token exchange failed:', err);
    res.redirect('/?error=token_exchange_failed');
  }
});



// Global error handler
app.use((err, req, res, next) => {
  console.error('✗ Server error:', err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: isDev ? err.message : undefined,
  });
});

// ============================================================================
// Database SQlite
// ============================================================================
const db = new Database(path.join(__dirname, "database.db"), {
  fileMustExist: false
});

// Enable safer defaults
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ============================
// USERS TABLE
// ============================
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    signup_ip TEXT NOT NULL
  )
`).run();

// ============================
// COMMENTS TABLE
// ============================
db.prepare(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

/* ---------------- Prepared Statements ---------------- */
/* USERS */
const createUser = db.prepare(`
  INSERT INTO users (username, password_hash, signup_ip)
  VALUES (?, ?, ?)
`);

const getUserByUsername = db.prepare(`
  SELECT * FROM users WHERE username = ?
`);

const countUsersByIP = db.prepare(`
  SELECT COUNT(*) as count FROM users WHERE signup_ip = ?
`);

/* COMMENTS */
const createComment = db.prepare(`
  INSERT INTO comments (user_id, title, body)
  VALUES (?, ?, ?)
`);

const getAllComments = db.prepare(`
  SELECT c.id, c.title, c.body, c.created_at, u.username, u.id as user_id
  FROM comments c
  JOIN users u ON c.user_id = u.id
  ORDER BY c.created_at DESC
`);

const countCommentsByUser = db.prepare(`
  SELECT COUNT(*) as count FROM comments WHERE user_id = ?
`);

const getCommentById = db.prepare(`
  SELECT * FROM comments WHERE id = ?
`);

const deleteCommentById = db.prepare(`
  DELETE FROM comments WHERE id = ?
`);

// ============================================================================
// Database API Endpoints
// ============================================================================


// ============================================================================
// My Own Rolled Auth
// ============================================================================

// ============================================================================
// Rolled Auth API Endpoints
// ============================================================================

/* ===========================
   REGISTER
=========================== */
app.post("/api/auth/register", async (req, res) => {
  let { username, password } = req.body;
  const ip = req.ip;

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length < 3 ||
    password.length < 8
  ) {
    return res.status(400).json({ error: "Invalid username or password" });
  }

  username = username.toLowerCase().trim();

  if (countUsersByIP.get(ip).count >= 3) {
    return res.status(403).json({ error: "Account limit reached for this IP" });
  }

  try {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id
    });

    const result = createUser.run(username, hash, ip);

    req.session.user = {
      id: result.lastInsertRowid,
      username
    };

    req.session.ua = hashUA(req);
    res.status(201).json({
      success: true,
      message: "Account created successfully"
    });
  } catch {
    res.status(409).json({ error: "Username already exists" });
  }
});

/* ===========================
   LOGIN
=========================== */
app.post("/api/auth/login", async (req, res) => {
  let { username, password } = req.body;

  username = username.toLowerCase().trim();

  const user = getUserByUsername.get(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await argon2.verify(user.password_hash, password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  req.session.user = {
    id: user.id,
    username: user.username
  };
  req.session.ua = hashUA(req);
  res.json({
    success: true,
    message: "Signed in successfully"
  });
});

/* ===========================
   LOGOUT
=========================== */
// Spotify-only logout
app.post('/api/auth/spotify/logout', (req, res) => {
  delete req.session.spotifyToken;
  delete req.session.refreshToken;
  delete req.session.tokenExpiry;
  res.json({ success: true });
});


// App logout (used by comments.js)
app.post('/api/auth/logout', (req, res) => {
  delete req.session.user;
  res.json({ success: true });
});


/* ===========================
   READ (public)
=========================== */
app.get("/api/comments", (req, res) => {
  res.json(getAllComments.all());
});

/* ===========================
   CREATE (auth required)
=========================== */
app.post("/api/comments", requireAuth, (req, res) => {
  const { title, body } = req.body;
  const userId = req.session.user.id;

  if (
    typeof title !== "string" ||
    typeof body !== "string" ||
    title.length > 128 ||
    body.length > 4000 ||
    !title.trim() ||
    !body.trim()
  ) {
    return res.status(400).json({ error: "Invalid comment length" });
  }

  if (countCommentsByUser.get(userId).count >= 5) {
    return res.status(403).json({ error: "Comment limit reached" });
  }

  const cleanTitle = sanitizeHtml(title.trim(), { allowedTags: [], allowedAttributes: {} });
  const cleanBody = sanitizeHtml(body.trim(), { allowedTags: [], allowedAttributes: {} });

  createComment.run(userId, cleanTitle, cleanBody);
  res.status(201).json({ success: true });
});

/* ===========================
   DELETE (owner only)
=========================== */
app.delete("/api/comments/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.user.id;

  const comment = getCommentById.get(id);
  if (!comment) {
    return res.status(404).json({ error: "Comment not found" });
  }

  if (comment.user_id !== userId) {
    return res.status(403).json({ error: "Not your comment" });
  }

  deleteCommentById.run(id);
  res.json({ success: true });
});


// ============================================================================
// SPA SUPPORT & ERROR HANDLING
// ============================================================================


// Handle 404 for API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  next();
});
// Serve index.html for all other routes (SPA support)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// STARTUP
// ============================================================================

// Initialize cache on startup - FIXED: Only refresh if cache is invalid
console.log('🚀 Initializing server...');

if (isCacheValid()) {
  console.log('✓ Cache is valid, skipping initial refresh');
} else {
  console.log('⚠️  Cache is expired or missing, fetching fresh data...');
  refreshCache().catch((err) => {
    console.error('✗ Failed to initialize cache on startup:', err.message);
  });
}

// Set up periodic cache refresh
setInterval(() => {
  if (!isCacheValid()) {
    console.log('🔄 Periodic cache refresh triggered');
    refreshCache().catch((err) => {
      console.error('✗ Periodic cache refresh failed:', err);
    });
  }
}, CACHE_DURATION);

// Start server
if (isDev) {
  const sslOptions = {
    key: fs.readFileSync('./localhost-key.pem'),
    cert: fs.readFileSync('./localhost.pem'),
  };

  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`✓ HTTPS dev server running at https://localhost:${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  });
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`✓ HTTP server running at http://localhost:${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'production'}`);
  });
}

