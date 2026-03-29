const mqtt = require('mqtt');

const brokerUrl = 'mqtt://100.117.220.15:1883';
const options = {
  username: 'leephusvux1994',
  password: 'Vu31101994@'
};

const client = mqtt.connect(brokerUrl, options);

client.on('connect', () => {
  console.log('Connected to EMQX broker on VPS1 (100.117.220.15)');
  
  // Topic architecture: COMPANY/DEVICE_CODE/TOKEN/#
  const topics = [
    'BKTech/1001/2aaa63ff-64b0-455f-b28d-83e0972fee97/#',
  ];
  
  client.subscribe(topics, (err, granted) => {
    if (!err) {
      console.log('Subscribed to:', granted);
      console.log('Waiting for messages...');
    } else {
      console.error('Subscribe error:', err);
    }
  });
});

client.on('message', (topic, message) => {
  console.log(`\n[${new Date().toISOString()}] Topic: ${topic}`);
  try {
    const json = JSON.parse(message.toString());
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.log(message.toString());
  }
});

client.on('error', (err) => {
  console.error('Connection error:', err);
});
