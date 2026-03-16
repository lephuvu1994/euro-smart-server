export declare class MCPResourcesService {
    getApiOverview(): Promise<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
    getServerStatus(): Promise<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
    getDocumentation(variables: {
        section: string;
    }): Promise<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
    getConfig(variables: {
        key: string;
    }): Promise<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
}
