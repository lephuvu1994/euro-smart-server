export interface ITranslateOptions {
  lang?: string;
  args?: Record<string, any>;
  defaultValue?: string;
}
export interface ITranslateItem {
  key: string;
  args?: Record<string, any>;
  defaultValue?: string;
}
export declare enum TranslationKey {
  HTTP_SUCCESS = 'http.success',
  HTTP_ERROR = 'http.error',
  AUTH_ERROR = 'auth.error',
  VALIDATION_ERROR = 'validation',
  OPERATION_SUCCESS = 'common.operationSuccess',
  OPERATION_FAILED = 'common.operationFailed',
}
