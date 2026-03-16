export declare function getMCPHelmetConfig(): {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: string[];
            baseUri: string[];
            blockAllMixedContent: any[];
            fontSrc: string[];
            frameAncestors: string[];
            imgSrc: string[];
            objectSrc: string[];
            scriptSrc: string[];
            scriptSrcAttr: string[];
            styleSrc: string[];
            upgradeInsecureRequests: any[];
        };
    };
    crossOriginEmbedderPolicy: boolean;
    crossOriginResourcePolicy: {
        policy: string;
    };
};
