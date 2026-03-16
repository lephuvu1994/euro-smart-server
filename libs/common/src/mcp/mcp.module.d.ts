import { DynamicModule, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { MCPModuleOptions } from './mcp.interfaces';
export declare class MCPExplorerService implements OnModuleInit {
    private readonly discoveryService;
    private readonly metadataScanner;
    private readonly reflector;
    constructor(discoveryService: DiscoveryService, metadataScanner: MetadataScanner, reflector: Reflector);
    onModuleInit(): void;
    explore(): void;
}
export declare class MCPModule {
    static forRootAsync(options: {
        imports?: any[];
        inject?: any[];
        useFactory: (...args: any[]) => Promise<MCPModuleOptions> | MCPModuleOptions;
        rootPath?: boolean;
    }): DynamicModule;
}
