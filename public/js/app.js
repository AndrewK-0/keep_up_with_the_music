// Sample artist data
const artistsData = [
    {
        id: 1,
        name: 'Taylor Swift',
        genre: 'Pop, Country',
        image: 'https://via.placeholder.com/200/FF6B9D/FFFFFF?text=TS',
        biography: 'Taylor Swift is an American singer-songwriter known for narrative songs about her personal life. She has won numerous awards and is one of the best-selling music artists of all time.',
        latestReleases: [
            { title: 'Midnights', year: '2022', image: 'https://via.placeholder.com/200/4A5568/FFFFFF?text=Midnights' },
            { title: 'Red (Taylor\'s Version)', year: '2021', image: 'https://via.placeholder.com/200/DC2626/FFFFFF?text=Red' }
        ],
        popularSong: {
            title: 'Anti-Hero',
            streams: '1.2B streams'
        },
        popularAlbum: {
            title: '1989',
            sales: '10M+ copies sold'
        }
    },
    {
        id: 2,
        name: 'The Weeknd',
        genre: 'R&B, Pop',
        image: 'https://via.placeholder.com/200/8B5CF6/FFFFFF?text=TW',
        biography: 'The Weeknd is a Canadian singer, songwriter, and record producer. Known for his sonic versatility and dark lyricism, he has influenced contemporary popular music.',
        latestReleases: [
            { title: 'Dawn FM', year: '2022', image: 'https://via.placeholder.com/200/6366F1/FFFFFF?text=Dawn+FM' },
            { title: 'After Hours', year: '2020', image: 'https://via.placeholder.com/200/DC2626/FFFFFF?text=After+Hours' }
        ],
        popularSong: {
            title: 'Blinding Lights',
            streams: '3.8B streams'
        },
        popularAlbum: {
            title: 'After Hours',
            sales: '5M+ copies sold'
        }
    },
    {
        id: 3,
        name: 'Billie Eilish',
        genre: 'Alternative Pop, Indie',
        image: 'https://via.placeholder.com/200/10B981/FFFFFF?text=BE',
        biography: 'Billie Eilish is an American singer-songwriter who first gained attention in 2015. She is known for her unique musical style and visual aesthetic.',
        latestReleases: [
            { title: 'Happier Than Ever', year: '2021', image: 'https://via.placeholder.com/200/F59E0B/FFFFFF?text=Happier' },
            { title: 'When We All Fall Asleep', year: '2019', image: 'https://via.placeholder.com/200/059669/FFFFFF?text=Sleep' }
        ],
        popularSong: {
            title: 'bad guy',
            streams: '2.5B streams'
        },
        popularAlbum: {
            title: 'When We All Fall Asleep, Where Do We Go?',
            sales: '3M+ copies sold'
        }
    },
    {
        id: 4,
        name: 'Drake',
        genre: 'Hip Hop, R&B',
        image: 'https://via.placeholder.com/200/F97316/FFFFFF?text=Drake',
        biography: 'Drake is a Canadian rapper, singer, and songwriter. He is one of the world\'s best-selling music artists and has won numerous Grammy Awards.',
        latestReleases: [
            { title: 'Honestly, Nevermind', year: '2022', image: 'https://via.placeholder.com/200/0EA5E9/FFFFFF?text=Honestly' },
            { title: 'Certified Lover Boy', year: '2021', image: 'https://via.placeholder.com/200/EC4899/FFFFFF?text=CLB' }
        ],
        popularSong: {
            title: 'One Dance',
            streams: '3.1B streams'
        },
        popularAlbum: {
            title: 'Scorpion',
            sales: '7M+ copies sold'
        }
    },
    {
        id: 5,
        name: 'Dua Lipa',
        genre: 'Pop, Dance',
        image: 'https://via.placeholder.com/200/EC4899/FFFFFF?text=DL',
        biography: 'Dua Lipa is an English singer and songwriter. She has received numerous accolades and is known for her mezzo-soprano vocal range.',
        latestReleases: [
            { title: 'Future Nostalgia', year: '2020', image: 'https://via.placeholder.com/200/8B5CF6/FFFFFF?text=Future' },
            { title: 'Club Future Nostalgia', year: '2020', image: 'https://via.placeholder.com/200/6366F1/FFFFFF?text=Club' }
        ],
        popularSong: {
            title: 'Levitating',
            streams: '2.7B streams'
        },
        popularAlbum: {
            title: 'Future Nostalgia',
            sales: '4M+ copies sold'
        }
    }
];

// DOM elements
const artistList = document.getElementById('artistList');
const artistDetails = document.getElementById('artistDetails');

let currentArtistId = null;

// Initialize the app
function init() {
    renderArtistList();
}

// Render artist cards in the sidebar
function renderArtistList() {
    artistList.innerHTML = '';
    
    artistsData.forEach(artist => {
        const card = createArtistCard(artist);
        artistList.appendChild(card);
    });
}

// Create artist card element
function createArtistCard(artist) {
    const card = document.createElement('div');
    card.className = 'artist-card';
    card.dataset.artistId = artist.id;
    
    card.innerHTML = `
        <img src="${artist.image}" alt="${artist.name}" class="artist-card-image">
        <div class="artist-card-content">
            <div class="artist-card-name">${artist.name}</div>
            <div class="artist-card-genre">${artist.genre}</div>
        </div>
    `;
    
    card.addEventListener('click', () => showArtistDetails(artist.id));
    
    return card;
}

// Show artist details
function showArtistDetails(artistId) {
    const artist = artistsData.find(a => a.id === artistId);
    if (!artist) return;
    
    currentArtistId = artistId;
    
    // Update active state on cards
    document.querySelectorAll('.artist-card').forEach(card => {
        card.classList.remove('active');
        if (parseInt(card.dataset.artistId) === artistId) {
            card.classList.add('active');
        }
    });
    
    // Render artist details
    artistDetails.innerHTML = renderArtistDetailsContent(artist);
    artistDetails.classList.add('active');
    
    // Hide artist list on mobile
    if (window.innerWidth <= 768) {
        artistList.classList.add('hidden');
    }
    
    // Add back button event listener
    const backButton = document.querySelector('.back-button');
    if (backButton) {
        backButton.addEventListener('click', hideArtistDetails);
    }
}

// Render artist details content
function renderArtistDetailsContent(artist) {
    return `
        <button class="back-button">Back to Artists</button>
        <div class="details-content">
            <div class="artist-header">
                <img src="${artist.image}" alt="${artist.name}" class="artist-header-image">
                <div class="artist-header-info">
                    <h2>${artist.name}</h2>
                    <span class="artist-genre-tag">${artist.genre}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h3>Biography</h3>
                <p>${artist.biography}</p>
            </div>
            
            <div class="detail-section">
                <h3>Latest Releases</h3>
                <div class="releases-grid">
                    ${artist.latestReleases.map(release => `
                        <div class="release-card">
                            <img src="${release.image}" alt="${release.title}">
                            <h4>${release.title}</h4>
                            <p>${release.year}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="detail-section">
                <h3>Most Popular Song</h3>
                <div class="popular-item">
                    <h4>${artist.popularSong.title}</h4>
                    <p>${artist.popularSong.streams}</p>
                </div>
            </div>
            
            <div class="detail-section">
                <h3>Most Popular Album</h3>
                <div class="popular-item">
                    <h4>${artist.popularAlbum.title}</h4>
                    <p>${artist.popularAlbum.sales}</p>
                </div>
            </div>
        </div>
    `;
}

// Hide artist details (mobile)
function hideArtistDetails() {
    artistDetails.classList.remove('active');
    artistList.classList.remove('hidden');
    
    // Remove active state from cards
    document.querySelectorAll('.artist-card').forEach(card => {
        card.classList.remove('active');
    });
    
    currentArtistId = null;
}

// Handle window resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        artistList.classList.remove('hidden');
        if (currentArtistId) {
            artistDetails.classList.add('active');
        }
    }
});

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}