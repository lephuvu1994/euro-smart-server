import {
  IPrismaQueryBuilderOptions,
  IPrismaQueryResult,
  IQueryOptions,
} from './query.builder.interface';
type PrismaDelegate = {
  count: (args?: any) => Promise<number>;
  findMany: (args?: any) => Promise<any[]>;
};
export interface IHelperPrismaQueryBuilderService {
  buildQuery<T>(
    delegate: PrismaDelegate,
    options: IQueryOptions,
    builderOptions?: Partial<IPrismaQueryBuilderOptions>,
  ): Promise<IPrismaQueryResult<T>>;
  buildCursorQuery<T>(
    delegate: PrismaDelegate,
    options: IQueryOptions & {
      cursor?: Record<string, any>;
    },
    builderOptions?: Partial<IPrismaQueryBuilderOptions>,
  ): Promise<{
    data: T[];
    nextCursor?: Record<string, any>;
  }>;
}
export {};
