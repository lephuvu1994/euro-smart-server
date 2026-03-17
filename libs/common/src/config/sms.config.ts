import { registerAs } from '@nestjs/config';

export default registerAs('sms', () => ({
  simPort: process.env.SIM_PORT || '',
}));
