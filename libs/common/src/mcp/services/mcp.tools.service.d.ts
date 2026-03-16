export declare class MCPToolsService {
    add(params: {
        a: number;
        b: number;
    }): Promise<number>;
    subtract(params: {
        a: number;
        b: number;
    }): Promise<number>;
    multiply(params: {
        a: number;
        b: number;
    }): Promise<number>;
    divide(params: {
        a: number;
        b: number;
    }): Promise<number>;
    toUpperCase(params: {
        text: string;
    }): Promise<string>;
    toLowerCase(params: {
        text: string;
    }): Promise<string>;
    generateUUID(): Promise<string>;
    getCurrentTimestamp(): Promise<number>;
}
