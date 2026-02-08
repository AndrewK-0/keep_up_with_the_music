// app.js - Frontend JavaScript for Keep Up With The Music

let artistsData = [];
let isAuthenticated = false;

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/spotify/status');

    if (response.status === 401) {
      isAuthenticated = false;
      updateAuthUI();
      showSessionExpired();
      return false;
    }

    const data = await response.json();
    isAuthenticated = data.authenticated;
    updateAuthUI();
    return data.authenticated;
  } catch (error) {
    console.error('Error checking auth status:', error);
    return false;
  }
}


function updateAuthUI() {
  const loginBtn = document.getElementById('spotifyLoginBtn');
  const logoutBtn = document.getElementById('spotifyLogoutBtn');

  if (isAuthenticated) {
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'block';
  } else {
    loginBtn.style.display = 'block';
    logoutBtn.style.display = 'none';
  }
}

function handleLogin() {
  window.location.href = '/auth/spotify';
}

async function handleLogout() {
  try {
   const response = await fetch('/api/auth/spotify/logout', { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      isAuthenticated = false;
      updateAuthUI();
      // Reload artists to show global chart
      loadArtists();
    }
  } catch (error) {
    console.error('Error logging out:', error);
  }
}

// ============================================================================
// ARTIST LOADING
// ============================================================================

async function loadArtists() {
  try {
    showLoading();

    const response = await fetch('/api/artists');
    const data = await response.json();

    if (data.success) {
      artistsData = data.artists;
      displayArtists(artistsData, data.source);
    } else {
      showError('Failed to load artists');
    }
  } catch (error) {
    console.error('Error loading artists:', error);
    showError('Error connecting to server');
  }
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function displayArtists(artists, source = 'global') {
  const artistList = document.getElementById('artistList');

  if (!artists || artists.length === 0) {
    artistList.innerHTML = '<p class="no-data">No artists found</p>';
    return;
  }

  // Add header showing whether it's personal or global
  const headerText = source === 'personal' 
    ? '🎧 Your Top Artists' 
    : '🌍 Global Top 50';

  artistList.innerHTML = `
    <div class="list-header">
      <h2>${headerText}</h2>
    </div>
    ${artists
      .map(
        (artist) => `
      <div class="artist-card" data-artist-id="${artist.id}">
        <div class="artist-card-image">
          ${
            artist.images && artist.images.length > 0
              ? `<img src="${artist.images[artist.images.length - 1].url}" alt="${artist.name}">`
              : `<div class="no-image">${artist.name.charAt(0)}</div>`
          }
        </div>
        <div class="artist-card-content">
          <h3 class="artist-card-name">${artist.name}</h3>
          <p class="artist-card-genre">${
            artist.genres && artist.genres.length > 0
              ? artist.genres.slice(0, 2).join(', ')
              : 'Artist'
          }</p>
          <div class="artist-stats">
            <span>⭐ ${artist.popularity || 'N/A'}</span>
            ${artist.followers ? `<span>👥 ${formatNumber(artist.followers.total || artist.followers)}</span>` : ''}
          </div>
        </div>
      </div>
    `
      )
      .join('')}
  `;

  // Add event listeners to all artist cards
  document.querySelectorAll('.artist-card').forEach((card) => {
    card.addEventListener('click', () => {
      const artistId = card.dataset.artistId;
      selectArtist(artistId);
    });
  });
}

async function selectArtist(artistId) {
  try {
    // Update selected state
    document.querySelectorAll('.artist-card').forEach((card) => {
      card.classList.remove('active');
    });
    const selectedCard = document.querySelector(`[data-artist-id="${artistId}"]`);
    if (selectedCard) {
      selectedCard.classList.add('active');
    }

    // Show loading in details panel
    const detailsPanel = document.getElementById('artistDetails');
    detailsPanel.classList.add('active');
    detailsPanel.innerHTML = '<div class="loading">Loading artist details...</div>';

    // Hide artist list on mobile
    const artistList = document.getElementById('artistList');
    if (window.innerWidth <= 768) {
      artistList.classList.add('hidden');
    }

    // Fetch detailed artist info
    const response = await fetch(`/api/artists/${artistId}`);
    const data = await response.json();

    if (data.success) {
      displayArtistDetails(data.artist, data.topTracks);
    } else {
      detailsPanel.innerHTML = '<div class="error">Failed to load artist details</div>';
    }
  } catch (error) {
    console.error('Error loading artist details:', error);
    document.getElementById('artistDetails').innerHTML =
      '<div class="error">Error loading artist details</div>';
  }
}

function displayArtistDetails(artist, topTracks) {
  const detailsPanel = document.getElementById('artistDetails');

  const headerImage = artist.images && artist.images.length > 0 ? artist.images[0].url : '';

  detailsPanel.innerHTML = `
    <button class="back-button" id="backButton">← Back to Artists</button>
    
    <div class="artist-header">
      <div class="artist-header-content">
        ${
          headerImage
            ? `<img src="${headerImage}" alt="${artist.name}" class="artist-header-image">`
            : `<div class="artist-header-placeholder">${artist.name.charAt(0)}</div>`
        }
        <div class="artist-header-info">
          <h2>${artist.name}</h2>
          <div class="artist-meta">
            <div class="meta-item">
              <strong>${formatNumber(artist.followers)}</strong>
              <span>Followers</span>
            </div>
            <div class="meta-item">
              <strong>${artist.popularity}</strong>
              <span>Popularity</span>
            </div>
          </div>
          ${
            artist.genres && artist.genres.length > 0
              ? `
            <div class="artist-genre-tags">
              ${artist.genres.map((genre) => `<span class="artist-genre-tag">${genre}</span>`).join('')}
            </div>
          `
              : ''
          }
          <a href="${artist.spotify_url}" target="_blank" rel="noopener noreferrer" class="spotify-link">
            Open in Spotify →
          </a>
        </div>
      </div>
    </div>
    
    ${
      topTracks && topTracks.length > 0
        ? `
      <div class="detail-section">
        <h3>Top Tracks</h3>
        <div class="track-list">
          ${topTracks
            .map(
              (track, index) => `
            <div class="track-item">
              <span class="track-number">${index + 1}</span>
              <div class="track-info">
                <div class="track-name">${track.name}</div>
                <div class="track-album">${track.album}</div>
              </div>
              <a href="${track.spotify_url}" target="_blank" rel="noopener noreferrer" class="track-play">
                ▶
              </a>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
        : ''
    }
  `;

  // Add event listener to back button
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', goBackToList);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function goBackToList() {
  const artistList = document.getElementById('artistList');
  const detailsPanel = document.getElementById('artistDetails');

  artistList.classList.remove('hidden');
  detailsPanel.classList.remove('active');

  // Clear active state
  document.querySelectorAll('.artist-card').forEach((card) => {
    card.classList.remove('active');
  });
}

function showLoading() {
  const artistList = document.getElementById('artistList');
  artistList.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading artists...</p>
    </div>
  `;
}

function showError(message) {
  const artistList = document.getElementById('artistList');
  artistList.innerHTML = `
    <div class="error-container">
      <p class="error-message">${message}</p>
      <button onclick="loadArtists()" class="retry-button">Retry</button>
    </div>
  `;
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function checkForAuthMessages() {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  const auth = urlParams.get('auth');

  if (error) {
    let message = 'Authentication failed';
    if (error === 'spotify_auth_failed') {
      message = 'Spotify authentication failed. Please try again.';
    } else if (error === 'invalid_state') {
      message = 'Invalid authentication state. Please try again.';
    } else if (error === 'token_exchange_failed') {
      message = 'Failed to exchange token. Please try again.';
    }
    
    // You could show a toast notification here
    console.error(message);
    
    // Clean URL
    window.history.replaceState({}, document.title, '/');
  }

  if (auth === 'success') {
    console.log('Successfully authenticated!');
    // Clean URL
    window.history.replaceState({}, document.title, '/');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Check for auth messages in URL
  checkForAuthMessages();

  // Check authentication status
  await checkAuthStatus();

  // Set up event listeners
  const loginBtn = document.getElementById('spotifyLoginBtn');
  const logoutBtn = document.getElementById('spotifyLogoutBtn');

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Load artists
  loadArtists();

});

function showSessionExpired(message = "Your session expired. You’ve been signed out.") {
  const banner = document.createElement("div");
  banner.className = "session-expired-banner";
  banner.textContent = message;

  document.body.prepend(banner);

  setTimeout(() => banner.remove(), 5000);
}

async function loadArtists() {
  try {
    showLoading();

    const response = await fetch('/api/artists');

    if (response.status === 401) {
      isAuthenticated = false;
      updateAuthUI();
      showSessionExpired();
      return;
    }

    const data = await response.json();

    if (data.success) {
      artistsData = data.artists;
      displayArtists(artistsData, data.source);
    } else {
      showError('Failed to load artists');
    }
  } catch (error) {
    console.error('Error loading artists:', error);
    showError('Error connecting to server');
  }
}
