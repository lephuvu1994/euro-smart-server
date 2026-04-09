const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('/root/aurathink-server/node_modules/pm2/bin/pm2 status || pm2 status || curl -sL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/nvm.sh | bash && source ~/.nvm/nvm.sh && pm2 status', (err, stream) => {
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
