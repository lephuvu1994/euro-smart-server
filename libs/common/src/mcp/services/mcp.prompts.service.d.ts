export declare class MCPPromptsService {
  codeReview(args: { language: string; code: string; focus?: string }): Promise<
    {
      role: 'user';
      content: {
        type: 'text';
        text: string;
      };
    }[]
  >;
  generateApiDocs(args: {
    method: string;
    path: string;
    description: string;
    requestBody?: string;
    responseBody?: string;
  }): Promise<
    {
      role: 'user';
      content: {
        type: 'text';
        text: string;
      };
    }[]
  >;
  generateNestJsService(args: { entityName: string; fields: string }): Promise<
    {
      role: 'user';
      content: {
        type: 'text';
        text: string;
      };
    }[]
  >;
  optimizeQuery(args: {
    database: string;
    query: string;
    schema?: string;
  }): Promise<
    {
      role: 'user';
      content: {
        type: 'text';
        text: string;
      };
    }[]
  >;
  generateUnitTests(args: { code: string; framework?: string }): Promise<
    {
      role: 'user';
      content: {
        type: 'text';
        text: string;
      };
    }[]
  >;
}
