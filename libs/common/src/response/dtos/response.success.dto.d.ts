import { IApiSuccessResponse } from '../interfaces/response.interface';
export declare class ApiSuccessResponseDto<T> implements IApiSuccessResponse<T> {
    statusCode: number;
    message: string;
    timestamp: string;
    data: T;
    constructor(statusCode: number, message: string, timestamp: string, data: T);
}
