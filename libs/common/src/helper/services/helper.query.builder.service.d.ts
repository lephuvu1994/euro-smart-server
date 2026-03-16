import { IPrismaQueryBuilderOptions, IPrismaQueryResult, IQueryOptions } from '../interfaces/query.builder.interface';
import { IHelperPrismaQueryBuilderService } from '../interfaces/query.builder.service.interface';
type PrismaDelegate = {
    count: (args?: any) => Promise<number>;
    findMany: (args?: any) => Promise<any[]>;
};
export declare class HelperPrismaQueryBuilderService implements IHelperPrismaQueryBuilderService {
    private readonly defaultOptions;
    buildQuery<T>(delegate: PrismaDelegate, options: IQueryOptions, builderOptions?: Partial<IPrismaQueryBuilderOptions>): Promise<IPrismaQueryResult<T>>;
    private buildWhereClause;
    private buildBasicFilters;
    private buildSearchConditions;
    private buildDateFilters;
    private buildRangeFilters;
    private buildEnumFilters;
    private buildOrderByClause;
    private buildSelectClause;
    private buildPaginationClause;
    private buildMetadata;
    private cleanQuery;
    buildCursorQuery<T>(delegate: PrismaDelegate, options: IQueryOptions & {
        cursor?: Record<string, any>;
    }, builderOptions?: Partial<IPrismaQueryBuilderOptions>): Promise<{
        data: T[];
        nextCursor?: Record<string, any>;
    }>;
}
export {};
