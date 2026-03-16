// Định nghĩa cấu trúc tham số (như 'a', 'b', 'text' trong ví dụ của bạn)
export interface MCPToolParameter {
  name: string;
  type: string; // 'number' | 'string' | ...
  description: string;
  required?: boolean;
}

// Option cho @MCPTool (đơn giản)
export interface MCPToolOptions {
  name: string;
  description: string;
}

// Option cho @MCPToolWithParams (phức tạp hơn)
export interface MCPToolWithParamsOptions extends MCPToolOptions {
  parameters: MCPToolParameter[];
}

// Interface cho Prompt (giữ lại từ phần trước)
export interface MCPPromptOptions {
  name: string;
  description: string;
  arguments?: any[];
}

// Cấu hình Module
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

// 👇 Thêm mới cho Resource Template (Động)
export interface MCPResourceTemplateOptions {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// ... Các interface module options giữ nguyên
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
