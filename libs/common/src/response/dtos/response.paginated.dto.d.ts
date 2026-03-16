export declare class ApiPaginationMetadataDto {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
}
export declare class ApiPaginatedDataDto<T> {
  items: T[];
  metadata: ApiPaginationMetadataDto;
}
