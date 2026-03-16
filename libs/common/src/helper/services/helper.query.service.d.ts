import { PinoLogger } from 'nestjs-pino';
import { ApiPaginatedDataDto } from '../../response/dtos/response.paginated.dto';
export declare class HelperQueryService {
    private readonly logger;
    private readonly DEFAULT_LIMIT;
    private readonly MAX_LIMIT;
    constructor(logger: PinoLogger);
    query<T>(delegate: any): QueryBuilder<T>;
}
declare class QueryBuilder<T> {
    private delegate;
    private logger;
    private config;
    private whereConditions;
    private page;
    private limit;
    private orderByClause;
    private includeClause;
    private selectClause;
    constructor(delegate: any, logger: PinoLogger, config: {
        defaultLimit: number;
        maxLimit: number;
    });
    paginate(params: {
        page?: number;
        limit?: number;
    }): this;
    search(searchQuery?: string, fields?: string[]): this;
    filter(filters?: Record<string, any>): this;
    where(condition: any): this;
    sort(orderBy: Record<string, 'asc' | 'desc'>): this;
    include(include: Record<string, boolean | object>): this;
    select(select: Record<string, boolean>): this;
    execute(): Promise<ApiPaginatedDataDto<T>>;
    getMany(): Promise<T[]>;
    getFirst(): Promise<T | null>;
    count(): Promise<number>;
}
export {};
