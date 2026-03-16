import {
  DynamicModule,
  Global,
  Module,
  Provider,
  OnModuleInit,
  Injectable,
} from '@nestjs/common';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
  Reflector,
} from '@nestjs/core';
import { MCPModuleOptions } from './mcp.interfaces';
import {
  MCP_TOOL_METADATA,
  MCP_PROMPT_METADATA,
  MCP_TOOL_WITH_PARAMS_METADATA,
  MCP_RESOURCE_METADATA, // 👈 Thêm
  MCP_RESOURCE_TEMPLATE_METADATA,
} from './mcp.constants';

// Service nội bộ để quét logic (Explorer)
@Injectable()
export class MCPExplorerService implements OnModuleInit {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    this.explore();
  }

  explore() {
    // Lấy tất cả các providers (services) trong ứng dụng
    const providers = this.discoveryService.getProviders();

    providers.forEach((wrapper) => {
      const { instance } = wrapper;
      // Chỉ quét các service đã khởi tạo và có prototype
      if (!instance || typeof instance !== 'object') {
        return;
      }

      // Quét từng hàm trong service
      this.metadataScanner.scanFromPrototype(
        instance,
        Object.getPrototypeOf(instance),
        (methodName) => {
          const methodRef = instance[methodName];

          // 1. Kiểm tra xem có phải là @MCPTool không?
          const toolMetadata = this.reflector.get(MCP_TOOL_METADATA, methodRef);
          if (toolMetadata) {
            console.log(
              `[MCP] 🛠️  Found Tool: ${toolMetadata.name} (Method: ${methodName})`,
            );
          }

          // 2. Kiểm tra xem có phải là @MCPToolWithParams không?
          const toolParamsMetadata = this.reflector.get(
            MCP_TOOL_WITH_PARAMS_METADATA,
            methodRef,
          );
          if (toolParamsMetadata) {
            console.log(
              `[MCP] 🛠️  Found Tool (Params): ${toolParamsMetadata.name} (Method: ${methodName})`,
            );
          }

          // 3. Kiểm tra xem có phải là @MCPPrompt không?
          const promptMetadata = this.reflector.get(
            MCP_PROMPT_METADATA,
            methodRef,
          );
          if (promptMetadata) {
            console.log(
              `[MCP] 📝 Found Prompt: ${promptMetadata.name} (Method: ${methodName})`,
            );
          }
          // 👇 4. Kiểm tra @MCPResource
          const resourceMetadata = this.reflector.get(
            MCP_RESOURCE_METADATA,
            methodRef,
          );
          if (resourceMetadata) {
            console.log(
              `[MCP] 📦 Found Resource: ${resourceMetadata.name} (URI: ${resourceMetadata.uri})`,
            );
          }
          // 👇 5. Kiểm tra @MCPResourceTemplate
          const resourceTemplateMetadata = this.reflector.get(
            MCP_RESOURCE_TEMPLATE_METADATA,
            methodRef,
          );
          if (resourceTemplateMetadata) {
            console.log(
              `[MCP] 📑 Found Resource Template: ${resourceTemplateMetadata.name} (URI: ${resourceTemplateMetadata.uriTemplate})`,
            );
          }
        },
      );
    });
  }
}

@Global()
@Module({
  imports: [DiscoveryModule], // Quan trọng: Cần import DiscoveryModule
  providers: [MCPExplorerService], // Đăng ký Explorer service
})
export class MCPModule {
  static forRootAsync(options: {
    imports?: any[];
    inject?: any[];
    useFactory: (
      ...args: any[]
    ) => Promise<MCPModuleOptions> | MCPModuleOptions;
    rootPath?: boolean;
  }): DynamicModule {
    const optionsProvider: Provider = {
      provide: 'MCP_MODULE_OPTIONS',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: MCPModule,
      imports: [...(options.imports || []), DiscoveryModule], // Thêm DiscoveryModule vào đây
      providers: [optionsProvider, MCPExplorerService], // Thêm Explorer vào providers
      exports: [optionsProvider],
    };
  }
}
