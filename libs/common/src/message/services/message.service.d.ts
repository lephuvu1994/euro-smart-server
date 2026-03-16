import { I18nService } from 'nestjs-i18n';
import { ITranslateItem, ITranslateOptions } from '../interfaces/message.interface';
export declare class MessageService {
    private readonly i18nService;
    private readonly fallbackLanguage;
    constructor(i18nService: I18nService);
    translate(key: string, options?: ITranslateOptions): string;
    translateBulk(items: ITranslateItem[], lang?: string): string[];
    translateKey(parts: (string | number)[], options?: ITranslateOptions): string;
    getCurrentLanguage(): string;
    private resolveLanguage;
}
