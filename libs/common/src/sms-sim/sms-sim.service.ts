import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as gsm from 'serialport-gsm';
import { SerialPort } from 'serialport';

@Injectable()
export class SmsSimService implements OnModuleInit {
  private readonly logger = new Logger(SmsSimService.name);
  private modem: any = null;
  private isModemReady = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const port = this.configService.get<string>('sms.simPort');
    if (!port) {
      this.logger.warn('SIM_PORT not configured. SMS SIM Service disabled.');
      return;
    }

    try {
      // Lazy init modem — only when SIM_PORT is configured
      this.modem = gsm.Modem();

      // 1. Kiểm tra xem port có tồn tại không trước khi mở
      const ports = await SerialPort.list();
      const portExists = ports.some((p) => p.path === port);

      if (!portExists) {
        this.logger.warn(
          `Port ${port} not found. Available ports: ${ports
            .map((p) => p.path)
            .join(', ')}. SMS SIM Service disabled.`,
        );
        return;
      }

      this.logger.log(`Initializing SMS Modem on port: ${port}`);

      // 2. Thiết lập listeners trước khi mở port
      this.modem.on('open', () => {
        this.logger.log(`✅ Serial port ${port} opened.`);
        this.modem.initializeModem((err: any) => {
          if (err) {
            this.logger.error(`❌ Modem initialization failed: ${err.message}`);
            this.isModemReady = false;
          } else {
            this.isModemReady = true;
            this.logger.log('✅ Modem initialized and ready for SMS.');
          }
        });
      });

      this.modem.on('error', (err: any) => {
        this.logger.error(`❌ Modem Error: ${err.message}`);
        this.isModemReady = false;
      });

      this.modem.on('close', () => {
        this.logger.warn('Modem port closed.');
        this.isModemReady = false;
      });

      // 3. Tiến hành mở port
      this.modem.open(port, {
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        incomingCall: false,
        incomingSMS: false,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Critical error initializing serial port ${port}: ${errMsg}`,
      );
      this.isModemReady = false;
    }
  }

  async sendSms(phoneNumber: string, message: string): Promise<void> {
    if (!this.isModemReady) {
      throw new Error('SMS Modem is not ready or port not opened');
    }

    return new Promise((resolve, reject) => {
      // Chuẩn hóa SĐT (VD: +84...)
      let formattedPhone = phoneNumber;
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '+84' + formattedPhone.slice(1);
      }

      this.modem.sendSMS(formattedPhone, message, false, (response: any) => {
        if (response?.data?.response === 'Message Sent') {
          this.logger.log(`✅ SMS sent successfully to ${formattedPhone}`);
          resolve();
        } else {
          this.logger.error(
            `❌ Failed to send SMS to ${formattedPhone}: ${JSON.stringify(
              response,
            )}`,
          );
          reject(new Error(response?.data?.response || 'Failed to send SMS'));
        }
      });
    });
  }

  get ready(): boolean {
    return this.isModemReady;
  }
}
