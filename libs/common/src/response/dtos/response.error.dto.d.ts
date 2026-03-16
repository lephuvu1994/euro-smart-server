import { IApiErrorResponse } from '../interfaces/response.interface';
export declare class ApiErrorResponseDto implements IApiErrorResponse {
    statusCode: number;
    message: string;
    timestamp: string;
    error?: string | string[] | Record<string, unknown>;
    constructor(statusCode: number, message: string, timestamp: string, error?: string | string[] | Record<string, unknown>);
}
