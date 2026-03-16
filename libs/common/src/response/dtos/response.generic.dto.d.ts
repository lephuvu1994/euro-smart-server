export declare class ApiGenericResponseDto {
  success: boolean;
  message: string;
  constructor(success: boolean, message: string);
  static success(message: string): ApiGenericResponseDto;
  static error(message: string): ApiGenericResponseDto;
}
