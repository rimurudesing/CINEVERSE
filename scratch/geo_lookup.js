import http from 'http';
import https from 'https';

const ip = "2600:1f18:4f06:de01:6d8:f68f:f023:28b";
const url = `https://ipapi.co/${ip}/json/`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Geolocation Info:", parsed);
    } catch (e) {
      console.log("Raw response:", data);
    }
  });
}).on('error', (err) => {
  console.error("Error making HTTP request:", err);
});
