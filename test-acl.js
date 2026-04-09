const http = require('http');

const data = JSON.stringify({
  username: "leephusvux1994",
  topic: "device/#",
  action: "subscribe"
});

const req = http.request({
  hostname: 'localhost',
  port: 8080, // Maybe core-api is on 8080?
  path: '/api/v1/emqx/acl',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('ACL Response:', body));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
