import dns from 'dns';

const ip = "2600:1f18:4f06:de01:6d8:f68f:f023:28b";

dns.reverse(ip, (err, hostnames) => {
  if (err) {
    console.error("Error doing reverse lookup:", err);
    return;
  }
  console.log("Hostnames for the IP:", hostnames);
});
