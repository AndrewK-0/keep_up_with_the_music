// app.js - Frontend JavaScript for Keep Up With The Music

let artistsData = [];
let selectedArtist = null;

// Fetch artists from the backend
async function loadArtists() {
  try {
    showLoading();
    
    const response = await fetch('/api/artists');
    const data = await response.json();
    
    if (data.success) {
      artistsData = data.artists;
      displayArtists(artistsData);
    } else {
      showError('Failed to load artists');
    }
  } catch (error) {
    console.error('Error loading artists:', error);
    showError('Error connecting to server');
  }
}

// Display artists in the sidebar
function displayArtists(artists) {
  const artistList = document.getElementById('artistList');
  
  if (!artists || artists.length === 0) {
    artistList.innerHTML = '<p class="no-data">No artists found</p>';
    return;
  }
  
  artistList.innerHTML = artists.map((artist, index) => `
    <div class="artist-card" data-artist-id="${artist.id}">
      <div class="artist-card-image">
        ${artist.images && artist.images.length > 0 
          ? `<img src="${artist.images[artist.images.length - 1].url}" alt="${artist.name}">`
          : `<div class="no-image">${artist.name.charAt(0)}</div>`
        }
      </div>
      <div class="artist-card-content">
        <h3 class="artist-card-name">${artist.name}</h3>
        <p class="artist-card-genre">${artist.genres && artist.genres.length > 0 ? artist.genres.slice(0, 2).join(', ') : 'Artist'}</p>
        <div class="artist-stats">
          <span>★ ${artist.popularity || 'N/A'}</span>
          ${artist.followers ? `<span>👥 ${formatNumber(artist.followers)}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
  
  // Add event listeners to all artist cards
  document.querySelectorAll('.artist-card').forEach(card => {
    card.addEventListener('click', () => {
      const artistId = card.dataset.artistId;
      selectArtist(artistId);
    });
  });
}

// Select an artist and show details
async function selectArtist(artistId) {
  try {
    // Update selected state
    document.querySelectorAll('.artist-card').forEach(card => {
      card.classList.remove('active');
    });
    document.querySelector(`[data-artist-id="${artistId}"]`).classList.add('active');
    
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

// Display detailed artist information
function displayArtistDetails(artist, topTracks) {
  const detailsPanel = document.getElementById('artistDetails');
  
  const headerImage = artist.images && artist.images.length > 0 
    ? artist.images[0].url 
    : '';
  
  detailsPanel.innerHTML = `
    <button class="back-button" id="backButton">← Back to Artists</button>
    
    <div class="artist-header">
      <div class="artist-header-content">
        ${headerImage 
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
          ${artist.genres && artist.genres.length > 0 ? `
            <div class="artist-genre-tags">
              ${artist.genres.map(genre => `<span class="artist-genre-tag">${genre}</span>`).join('')}
            </div>
          ` : ''}
          <a href="${artist.spotify_url}" target="_blank" rel="noopener noreferrer" class="spotify-link">
            Open in Spotify →
          </a>
        </div>
      </div>
    </div>
    
    ${topTracks && topTracks.length > 0 ? `
      <div class="detail-section">
        <h3>Top Tracks</h3>
        <div class="track-list">
          ${topTracks.map((track, index) => `
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
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
  
  // Add event listener to back button
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', goBackToList);
  }
}

// Go back to artist list (mobile)
function goBackToList() {
  const artistList = document.getElementById('artistList');
  const detailsPanel = document.getElementById('artistDetails');
  
  artistList.classList.remove('hidden');
  detailsPanel.classList.remove('active');
  
  // Clear active state
  document.querySelectorAll('.artist-card').forEach(card => {
    card.classList.remove('active');
  });
}

// Show loading state
function showLoading() {
  const artistList = document.getElementById('artistList');
  artistList.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading top artists...</p>
    </div>
  `;
}

// Show error message
function showError(message) {
  const artistList = document.getElementById('artistList');
  artistList.innerHTML = `
    <div class="error-container">
      <p class="error-message">${message}</p>
      <button onclick="loadArtists()" class="retry-button">Retry</button>
    </div>
  `;
}

// Format large numbers (e.g., 1234567 -> 1.2M)
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  loadArtists();
});