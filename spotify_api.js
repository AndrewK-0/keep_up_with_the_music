const https = require('https');
const fs = require('fs');

// Replace these with your actual Spotify credentials
const CLIENT_ID = 'your_client_id_here';
const CLIENT_SECRET = 'your_client_secret_here';

// Step 1: Get access token using Client Credentials flow
function getAccessToken() {
  return new Promise((resolve, reject) => {
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

// Step 2: Fetch top artists from a playlist or search
function getTopArtists(accessToken) {
  return new Promise((resolve, reject) => {
    // Using "Top 50 - Global" playlist as a proxy for top artists
    // You can also use search or browse endpoints
    const playlistId = '37i9dQZEVXbMDoHDwVN2tF'; // Spotify's Global Top 50

    const options = {
      hostname: 'api.spotify.com',
      path: `/v1/playlists/${playlistId}/tracks?limit=50`,
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
          const playlistData = JSON.parse(data);
          
          // Extract unique artists
          const artistsMap = new Map();
          playlistData.items.forEach(item => {
            if (item.track && item.track.artists) {
              item.track.artists.forEach(artist => {
                if (!artistsMap.has(artist.id)) {
                  artistsMap.set(artist.id, {
                    name: artist.name,
                    id: artist.id,
                    spotify_url: artist.external_urls.spotify
                  });
                }
              });
            }
          });

          resolve(Array.from(artistsMap.values()));
        } else {
          reject(new Error(`Failed to get artists: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Step 3: Save artists to a text file
function saveArtistsToFile(artists, filename = 'top_artists.txt') {
  let content = `Top Artists from Spotify (Retrieved: ${new Date().toISOString()})\n`;
  content += '='.repeat(60) + '\n\n';

  artists.forEach((artist, index) => {
    content += `${index + 1}. ${artist.name}\n`;
    content += `   ID: ${artist.id}\n`;
    content += `   URL: ${artist.spotify_url}\n\n`;
  });

  fs.writeFileSync(filename, content, 'utf8');
  console.log(`✓ Saved ${artists.length} artists to ${filename}`);
}

// Main execution
async function main() {
  try {
    console.log('Authenticating with Spotify...');
    const accessToken = await getAccessToken();
    console.log('✓ Authentication successful');

    console.log('Fetching top artists...');
    const artists = await getTopArtists(accessToken);
    console.log(`✓ Found ${artists.length} artists`);

    saveArtistsToFile(artists);
    console.log('✓ Done!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();