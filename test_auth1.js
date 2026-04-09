const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('. ~/.bashrc && export PATH=$PATH:/var/lib/docker/rootfs/overlayfs/ebe47324590e724d76317b57eb89caf7660fec4a8a96340fdaee28b7f7c4a03b/usr/local/bin && sleep 10 && docker exec aurathink-core-api-prod cat /tmp/proxy.log', (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: '157.66.27.91',
  port: 22,
  username: 'root',
  password: 'Wpo%UP4&TB2f'
});
