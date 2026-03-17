import { registerAs } from '@nestjs/config';

export default registerAs(
  'doc',
  (): Record<string, any> => ({
    name: `${process.env.APP_NAME?.toUpperCase()} APIs Specification`,
    description: 'Euro smarthome API documentation',
    version: '1.0',
    prefix: '/docs',
  }),
);
