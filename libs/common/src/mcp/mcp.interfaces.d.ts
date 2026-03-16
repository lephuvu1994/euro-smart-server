export interface MCPToolParameter {
    name: string;
    type: string;
    description: string;
    required?: boolean;
}
export interface MCPToolOptions {
    name: string;
    description: string;
}
export interface MCPToolWithParamsOptions extends MCPToolOptions {
    parameters: MCPToolParameter[];
}
export interface MCPPromptOptions {
    name: string;
    description: string;
    arguments?: any[];
}
export interface MCPServerInfo {
    name: string;
    version: string;
}
export interface MCPModuleOptions {
    serverInfo: MCPServerInfo;
    autoDiscoverTools?: boolean;
    autoDiscoverResources?: boolean;
    autoDiscoverPrompts?: boolean;
    logLevel?: string;
}
export interface MCPResourceOptions {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}
export interface MCPResourceTemplateOptions {
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
}
export interface MCPServerInfo {
    name: string;
    version: string;
}
export interface MCPModuleOptions {
    serverInfo: MCPServerInfo;
    autoDiscoverTools?: boolean;
    autoDiscoverResources?: boolean;
    autoDiscoverPrompts?: boolean;
    logLevel?: string;
}
