import { PinoLogger } from 'nestjs-pino';
import { ApiPaginatedDataDto } from '../../response/dtos/response.paginated.dto';
import { IPaginationParams, IPrismaQueryOptions, PrismaDelegate } from '../interfaces/pagination.interface';
import { IHelperPaginationService } from '../interfaces/pagination.service.interface';
export declare class HelperPaginationService implements IHelperPaginationService {
    private readonly logger;
    private readonly DEFAULT_LIMIT;
    private readonly MAX_LIMIT;
    constructor(logger: PinoLogger);
    paginate<T>(delegate: PrismaDelegate, { page, limit }: IPaginationParams, options?: IPrismaQueryOptions): Promise<ApiPaginatedDataDto<T>>;
    buildSearchCondition(searchQuery: string, fields: string[]): {
        OR: Array<Record<string, any>>;
    } | null;
}
