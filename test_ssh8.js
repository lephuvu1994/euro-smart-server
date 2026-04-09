const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('. /root/.nvm/nvm.sh || source /etc/profile.d/nvm.sh || nvm use default; pm2 status || pm2 logs --lines 20', (err, stream) => {
    if (err) throw err;
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
