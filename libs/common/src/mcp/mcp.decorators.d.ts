import {
  MCPToolOptions,
  MCPToolWithParamsOptions,
  MCPPromptOptions,
  MCPResourceTemplateOptions,
} from './mcp.interfaces';
export declare const MCPTool: (
  options: MCPToolOptions,
) => import('@nestjs/common').CustomDecorator<string>;
export declare const MCPToolWithParams: (
  options: MCPToolWithParamsOptions,
) => import('@nestjs/common').CustomDecorator<string>;
export declare const MCPPrompt: (
  options: MCPPromptOptions,
) => import('@nestjs/common').CustomDecorator<string>;
export declare const MCPResource: (
  uriTemplate: string,
) => import('@nestjs/common').CustomDecorator<string>;
export declare const MCPResourceTemplate: (
  options: MCPResourceTemplateOptions,
) => import('@nestjs/common').CustomDecorator<string>;
