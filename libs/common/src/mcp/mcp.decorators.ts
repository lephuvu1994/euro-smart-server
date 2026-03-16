import { SetMetadata } from '@nestjs/common';
import {
  MCP_TOOL_METADATA,
  MCP_TOOL_WITH_PARAMS_METADATA,
  MCP_PROMPT_METADATA,
  MCP_RESOURCE_TEMPLATE_METADATA,
} from './mcp.constants';
import {
  MCPToolOptions,
  MCPToolWithParamsOptions,
  MCPPromptOptions,
  MCPResourceTemplateOptions,
} from './mcp.interfaces';

// Decorator: @MCPTool
export const MCPTool = (options: MCPToolOptions) => {
  return SetMetadata(MCP_TOOL_METADATA, options);
};

// Decorator: @MCPToolWithParams
export const MCPToolWithParams = (options: MCPToolWithParamsOptions) => {
  return SetMetadata(MCP_TOOL_WITH_PARAMS_METADATA, options);
};

// Decorator: @MCPPrompt (Giữ lại cho file Prompts Service)
export const MCPPrompt = (options: MCPPromptOptions) => {
  return SetMetadata(MCP_PROMPT_METADATA, options);
};

// Decorator: @MCPResource (Giữ lại nếu cần dùng sau này)
export const MCPResource = (uriTemplate: string) => {
  return SetMetadata('MCP_RESOURCE_METADATA', { uriTemplate });
};

// 👇 Decorator: @MCPResourceTemplate
export const MCPResourceTemplate = (options: MCPResourceTemplateOptions) => {
  return SetMetadata(MCP_RESOURCE_TEMPLATE_METADATA, options);
};
