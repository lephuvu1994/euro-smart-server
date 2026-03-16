export declare enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}
export declare enum SearchMode {
  DEFAULT = 'default',
  INSENSITIVE = 'insensitive',
}
export declare class DateFilterDto {
  field: string;
  from?: string;
  to?: string;
}
export declare class RangeFilterDto {
  field: string;
  min?: number;
  max?: number;
}
export declare class EnumFilterDto {
  field: string;
  values: string[];
}
export declare class BasePrismaQueryDto {
  page?: number;
  limit?: number;
  searchQuery?: string;
  searchFields?: string[];
  searchMode?: SearchMode;
  sortBy?: string;
  sortOrder?: SortOrder;
  orderBy?: Record<string, 'asc' | 'desc'>;
  select?: Record<string, boolean>;
  include?: Record<string, boolean | object>;
  filters?: Record<string, any>;
  dateFilters?: DateFilterDto[];
  rangeFilters?: RangeFilterDto[];
  enumFilters?: EnumFilterDto[];
  distinct?: string[];
}
export declare class UserQueryDto extends BasePrismaQueryDto {
  role?: string;
  isVerified?: boolean;
}
export declare class PostQueryDto extends BasePrismaQueryDto {
  status?: string;
  authorId?: string;
}
export declare class QueryMetaDto {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
export declare class PaginatedResponseDto<T> {
  data: T[];
  meta: QueryMetaDto;
}
